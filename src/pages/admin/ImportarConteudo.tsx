// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { useMemo, useRef, useState } from 'react'
import { Button, Carregando, Vazio } from '../../components/ui'
import { carregarPortal, salvarCategoria, salvarDocumento } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { listarModelos, salvarModelo } from '../../lib/checklistApi'
import { listarTrilhaManuais, salvarTrilhaManuais } from '../../lib/manuaisApi'
import {
  importarPacote, MAX_BYTES_PACOTE, planejarImportacao, validarPacote,
  type AcaoImportacao, type ExistentesImportacao, type PacoteConteudo, type PlanoImportacao, type RelatorioImportacao,
} from '../../lib/pacoteConteudo'
import { listarPacoteChaves, salvarPacoteChave } from '../../lib/pacoteChavesApi'
import { usePortal } from '../../lib/portal'
import { listarCursos, listarProvas, salvarCurso, salvarProva } from '../../lib/universidadeApi'
import type { Audiencia, Usuario } from '../../types'

const ROTULO_ACAO: Record<AcaoImportacao, string> = { criar: 'Criar', 'ja-existe': 'Já existe', atualizar: 'Atualizar', restrito: 'Ignorar', conflito: 'Vínculo em conflito' }
const CARTAO = 'rounded-2xl border border-line bg-white p-4 sm:p-6'
const CAIXA = 'h-4 w-4 shrink-0 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-dark'

async function carregarExistentes(user: Usuario): Promise<ExistentesImportacao> {
  const [biblioteca, trilha, cursos, provas, checklists, chaves] = await Promise.all([
    carregarPortal(user, { exigirBibliotecaCompleta: true }),
    listarTrilhaManuais(), listarCursos(true), listarProvas(), listarModelos(user, true), listarPacoteChaves(),
  ])
  return { categorias: biblioteca.categorias, documentos: biblioteca.documentos, trilha, cursos, provas, checklists, chaves }
}

function descreverAudiencia(audiencia: Partial<Audiencia>) {
  if (audiencia.publico === true) return 'Rede toda'
  const partes: string[] = []
  const unidades = audiencia.unidades?.length ?? 0
  const papeis = audiencia.papeis ?? []
  const pessoas = new Set([...(audiencia.uids ?? []), ...(audiencia.uidsExtra ?? [])]).size
  if (unidades) partes.push(`${unidades} ${unidades === 1 ? 'unidade' : 'unidades'}`)
  if (papeis.length) partes.push(`Papéis: ${papeis.join(', ')}`)
  if (pessoas) partes.push(`${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}`)
  return partes.join(' · ') || 'Sem audiência de rede informada'
}

function gruposDoPlano(plano: PlanoImportacao, pacote: PacoteConteudo) {
  const nomes = new Map(pacote.documentos.map((d) => [d.chave, d.titulo]))
  return [
    { titulo: 'Categorias', itens: plano.categorias.map((passo) => ({ ...passo, nome: passo.item.nome })) },
    { titulo: 'Documentos', itens: plano.documentos.map((passo) => ({ ...passo, nome: passo.item.titulo })) },
    { titulo: 'Itens da trilha', itens: plano.trilha.map((passo) => ({ ...passo, nome: nomes.get(passo.item.documento) })) },
    { titulo: 'Cursos', itens: plano.cursos.map((passo) => ({ ...passo, nome: passo.item.titulo })) },
    { titulo: 'Provas', itens: plano.provas.map((passo) => ({ ...passo, nome: passo.item.titulo })) },
    { titulo: 'Checklists', itens: plano.checklists.map((passo) => ({ ...passo, nome: passo.item.titulo })) },
  ]
}

export default function ImportarConteudo() {
  const { user } = useAuth()
  const { atualizar } = usePortal()
  const [pacote, setPacote] = useState<PacoteConteudo | null>(null)
  const [existentes, setExistentes] = useState<ExistentesImportacao | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [atualizarExistentes, setAtualizarExistentes] = useState(false)
  const [atualizarRestritos, setAtualizarRestritos] = useState(false)
  const [comoRascunho, setComoRascunho] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState({ feito: 0, total: 0, chave: '' })
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null)
  const ocupado = useRef(false)
  const plano = useMemo(() => pacote && existentes ? planejarImportacao(pacote, existentes, { atualizarExistentes, atualizarRestritos, comoRascunho }) : null,
    [pacote, existentes, atualizarExistentes, atualizarRestritos, comoRascunho])
  const grupos = useMemo(() => plano && pacote ? gruposDoPlano(plano, pacote) : [], [plano, pacote])
  const links = useMemo(() => pacote?.documentos.flatMap((doc) => [
    ...(doc.htmlUrl ? [{ url: doc.htmlUrl, nome: `${doc.titulo} — HTML interativo` }] : []),
    ...(doc.anexos ?? []).map((anexo) => ({ url: anexo.url, nome: `${doc.titulo} — ${anexo.nome}` })),
  ]) ?? [], [pacote])
  const temRestritos = grupos.some((grupo) => grupo.itens.some((item) => item.restrito))
  const total = grupos.reduce((soma, grupo) => soma + grupo.itens.length, 0)

  async function preparar(arquivo?: File) {
    if (!user || ocupado.current) return
    ocupado.current = true
    setLendo(true)
    setExistentes(null)
    setErros([])
    try {
      if (arquivo) {
        setPacote(null)
        setRelatorio(null)
        setProgresso({ feito: 0, total: 0, chave: '' })
        setAtualizarExistentes(false)
        setAtualizarRestritos(false)
        setComoRascunho(false)
        if (!/\.json$/i.test(arquivo.name)) {
          setErros(['Selecione um arquivo com a extensão .json.'])
          return
        }
        if (arquivo.size > MAX_BYTES_PACOTE) {
          setErros(['O arquivo aceita até 5 MB.'])
          return
        }
        let conteudo: string
        try {
          conteudo = await arquivo.text()
        } catch {
          setErros(['Não foi possível abrir o arquivo. Selecione-o novamente para tentar outra vez.'])
          return
        }
        let json: unknown
        try {
          json = JSON.parse(conteudo)
        } catch {
          setErros(['Não foi possível ler o arquivo como JSON. Confira o conteúdo e selecione o arquivo novamente.'])
          return
        }
        const validacao = validarPacote(json)
        if (!validacao.ok) {
          setErros(validacao.erros)
          return
        }
        setPacote(validacao.pacote)
      }
      setExistentes(await carregarExistentes(user))
    } catch {
      setErros(['Não foi possível consultar o conteúdo existente. Tente carregar a prévia novamente.'])
    } finally {
      ocupado.current = false
      setLendo(false)
    }
  }

  async function importar() {
    if (!user || !pacote || !plano || !total || ocupado.current) return
    ocupado.current = true
    setImportando(true)
    setRelatorio(null)
    setErros([])
    setProgresso({ feito: 0, total, chave: '' })
    let etapa: 'consulta' | 'gravacao' | 'atualizacao' = 'consulta'
    try {
      // Reconsulta a base antes de gravar para reconhecer itens salvos desde a prévia.
      const base = await carregarExistentes(user)
      const planoAtual = planejarImportacao(pacote, base, { atualizarExistentes, atualizarRestritos, comoRascunho })
      const mudou = ([ 'categorias', 'documentos', 'trilha', 'cursos', 'provas', 'checklists' ] as const).some((grupo) =>
        planoAtual[grupo].some((passo, i) => passo.acao !== plano[grupo][i].acao ||
          passo.alvoId !== plano[grupo][i].alvoId || passo.correspondencia !== plano[grupo][i].correspondencia ||
          JSON.stringify(passo.existente) !== JSON.stringify(plano[grupo][i].existente)),
      )
      if (mudou) {
        setAtualizarRestritos(false)
        setExistentes(base)
        setErros(['O conteúdo existente mudou. Confira a nova prévia antes de importar.'])
        return
      }
      etapa = 'gravacao'
      const resultado = await importarPacote(planoAtual, {
        salvarCategoria: (form, id, usuarios) => salvarCategoria(form, usuarios, id),
        salvarDocumento: (form, id, usuarios) => salvarDocumento(form, user, usuarios, id),
        salvarChave: (vinculo) => salvarPacoteChave(vinculo, user.uid),
        salvarTrilha: (itens, anteriores) => salvarTrilhaManuais(user, itens, anteriores),
        salvarCurso: (form) => salvarCurso(user, form),
        salvarProva: (form, versao) => salvarProva(user, form, versao),
        salvarModelo: (existente, form) => salvarModelo(user, existente, form),
      }, (feito, chave) => setProgresso({ feito, total, chave }))
      etapa = 'atualizacao'
      setRelatorio(resultado)
      setAtualizarRestritos(false)
      await atualizar()
      setExistentes(await carregarExistentes(user))
    } catch {
      setExistentes(null)
      const mensagens = {
        consulta: 'Não foi possível verificar o conteúdo existente antes da importação. Carregue a prévia e tente novamente.',
        gravacao: 'A gravação foi interrompida. Alguns itens podem ter sido salvos. Carregue a prévia para conferir o que falta.',
        atualizacao: 'O resultado da importação está abaixo. Não foi possível atualizar a prévia. Carregue-a novamente antes de importar.',
      }
      setErros([mensagens[etapa]])
    } finally {
      ocupado.current = false
      setImportando(false)
    }
  }

  const bloqueado = lendo || importando
  return (
    <div className="space-y-6">
      <header className="cabecalho-pagina">
        <h1 className="text-3xl font-bold">Importar pacote de conteúdo</h1>
        <p className="mt-1 text-sm text-ink-soft">Revise os itens e as ações antes de gravar o conteúdo da rede.</p>
      </header>

      <section className={CARTAO}>
        <label className="block text-sm font-semibold" htmlFor="arquivo-pacote">Arquivo do pacote</label>
        <p id="limite-pacote" className="mt-1 text-sm text-ink-soft">Selecione um arquivo .json de até 5 MB.</p>
        <input
          id="arquivo-pacote" type="file" accept=".json,application/json" aria-describedby="limite-pacote" disabled={bloqueado}
          className="mt-3 block w-full rounded-lg text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-paper file:px-3 file:py-2 file:font-semibold file:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-dark disabled:opacity-60"
          onChange={(e) => {
            const arquivo = e.currentTarget.files?.[0]
            e.currentTarget.value = ''
            if (arquivo) void preparar(arquivo)
          }}
        />
        {lendo ? <div className="mt-3" role="status"><Carregando texto="Preparando a prévia…" /></div> : null}
        {erros.length > 0 ? (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <ul className="list-disc space-y-1 break-words pl-5">
              {erros.slice(0, 100).map((erro, i) => <li key={i}>{erro}</li>)}
            </ul>
            {erros.length > 100 ? <p className="mt-2">Mais {erros.length - 100} erro(s) de validação.</p> : null}
            {pacote && !existentes && !bloqueado ? (
              <Button type="button" className="mt-3" variant="secondary" onClick={() => void preparar()}>Carregar prévia novamente</Button>
            ) : null}
          </div>
        ) : null}
      </section>

      {plano && pacote ? (
        <section className={CARTAO} aria-labelledby="previa-pacote">
          <h2 id="previa-pacote" className="text-xl font-bold">Prévia da importação</h2>
          <p className="mt-1 break-words text-sm text-ink-soft">{pacote.titulo}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {grupos.map((grupo) => (
              <div key={grupo.titulo} className="rounded-xl bg-paper p-3">
                <dt className="text-sm text-ink-soft">{grupo.titulo}</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums">{grupo.itens.length}</dd>
              </div>
            ))}
          </dl>
          {total ? (
            <>
              <div className="mt-4 space-y-2">
                {grupos.filter((grupo) => grupo.itens.length > 0).map((grupo) => (
                  <details key={grupo.titulo} open className="rounded-xl border border-line px-3">
                    <summary className="cursor-pointer rounded py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-dark">{grupo.titulo}</summary>
                    <ul className="divide-y divide-line border-t border-line text-sm">
                      {grupo.itens.map((item) => (
                        <li key={item.item.chave} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                          <div className="min-w-0 break-words">
                            <span className="font-medium">{item.nome}</span>
                            {item.existente ? (
                              <p className="mt-1 text-xs text-ink-soft">
                                ID {item.alvoId} · Por {item.correspondencia} · {descreverAudiencia(item.existente)}
                              </p>
                            ) : null}
                          </div>
                          <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 font-medium text-ink-soft">{ROTULO_ACAO[item.acao]}{item.restrito ? ' · Restrito' : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
              <section className="mt-5 rounded-xl border border-line p-3" aria-labelledby="links-externos-pacote">
                <h3 id="links-externos-pacote" className="text-sm font-semibold">Links externos</h3>
                {links.length ? (
                  <ul className="mt-2 divide-y divide-line text-sm">
                    {links.map(({ url, nome }, indice) => (
                      <li key={indice} className="py-2">
                        <p className="break-words font-medium">{nome}</p>
                        <p className="break-all text-ink-soft">{url}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-sm text-ink-soft">O pacote não contém links de interativos ou anexos.</p>}
              </section>
              <fieldset className="mt-5 space-y-2 rounded-xl bg-paper p-3" disabled={bloqueado}>
                <legend className="px-1 text-sm font-semibold">Opções da importação</legend>
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" className={CAIXA} checked={atualizarExistentes} onChange={(e) => {
                    setAtualizarExistentes(e.target.checked)
                    setAtualizarRestritos(false)
                  }} />
                  Atualizar itens que já existem
                </label>
                {temRestritos && atualizarExistentes ? (
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" className={CAIXA} checked={atualizarRestritos} onChange={(e) => setAtualizarRestritos(e.target.checked)} />
                    Atualizar também os itens restritos (a audiência atual é mantida)
                  </label>
                ) : null}
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" className={CAIXA} checked={comoRascunho} onChange={(e) => setComoRascunho(e.target.checked)} />
                  Importar documentos como rascunho
                </label>
              </fieldset>
              <Button type="button" className="mt-4" disabled={bloqueado} onClick={() => void importar()}>
                {importando ? 'Importando…' : 'Importar'}
              </Button>
            </>
          ) : <Vazio titulo="Pacote sem itens" texto="Selecione um arquivo com conteúdo para importar." />}
        </section>
      ) : null}

      {importando ? (
        <section className={CARTAO}>
          <h2 className="text-lg font-bold">Importação em andamento</h2>
          <progress aria-label="Itens processados" value={progresso.feito} max={progresso.total} className="mt-3 h-2 w-full accent-brand" />
          <p className="mt-2 text-sm text-ink-soft" role="status">{progresso.feito} de {progresso.total} itens processados. {progresso.chave}</p>
        </section>
      ) : null}

      {relatorio ? (
        <section className={CARTAO} aria-labelledby="resultado-pacote" aria-live="polite">
          <h2 id="resultado-pacote" className="text-xl font-bold">Resultado da importação</h2>
          <p className="mt-2 text-sm text-ink-soft">
            {relatorio.criados} criados · {relatorio.ignorados} ignorados · {relatorio.atualizados} atualizados · {relatorio.erros.length} erros
          </p>
          {relatorio.erros.length > 0 ? (
            <>
              <p className="mt-3 text-sm">Confira as falhas e importe novamente para retomar os itens que ainda faltam.</p>
              <ul className="mt-2 list-disc space-y-1 break-words pl-5 text-sm text-red-800">
                {relatorio.erros.map(({ chave, mensagem }) => <li key={chave}><strong>{chave}</strong> — {mensagem}</li>)}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
