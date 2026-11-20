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
import { usePortal } from '../../lib/portal'
import { listarCursos, listarProvas, salvarCurso, salvarProva } from '../../lib/universidadeApi'
import type { Usuario } from '../../types'

const ROTULO_ACAO: Record<AcaoImportacao, string> = { criar: 'Criar', 'ja-existe': 'Já existe', atualizar: 'Atualizar' }
const CARTAO = 'rounded-2xl border border-line bg-white p-4 sm:p-6'
const CAIXA = 'h-4 w-4 shrink-0 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-dark'

async function carregarExistentes(user: Usuario): Promise<ExistentesImportacao> {
  const [biblioteca, trilha, cursos, provas, checklists] = await Promise.all([
    carregarPortal(user, { exigirBibliotecaCompleta: true }),
    listarTrilhaManuais(), listarCursos(true), listarProvas(), listarModelos(user, true),
  ])
  return { categorias: biblioteca.categorias, documentos: biblioteca.documentos, trilha, cursos, provas, checklists }
}

function gruposDoPlano(plano: PlanoImportacao, pacote: PacoteConteudo) {
  const nomes = new Map(pacote.documentos.map((d) => [d.chave, d.titulo]))
  return [
    { titulo: 'Categorias', itens: plano.categorias.map(({ item, acao }) => ({ chave: item.chave, nome: item.nome, acao })) },
    { titulo: 'Documentos', itens: plano.documentos.map(({ item, acao }) => ({ chave: item.chave, nome: item.titulo, acao })) },
    { titulo: 'Itens da trilha', itens: plano.trilha.map(({ item, acao }) => ({ chave: item.chave, nome: nomes.get(item.documento), acao })) },
    { titulo: 'Cursos', itens: plano.cursos.map(({ item, acao }) => ({ chave: item.chave, nome: item.titulo, acao })) },
    { titulo: 'Provas', itens: plano.provas.map(({ item, acao }) => ({ chave: item.chave, nome: item.titulo, acao })) },
    { titulo: 'Checklists', itens: plano.checklists.map(({ item, acao }) => ({ chave: item.chave, nome: item.titulo, acao })) },
  ]
}

export default function ImportarConteudo() {
  const { user } = useAuth()
  const { atualizar } = usePortal()
  const [pacote, setPacote] = useState<PacoteConteudo | null>(null)
  const [existentes, setExistentes] = useState<ExistentesImportacao | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [atualizarExistentes, setAtualizarExistentes] = useState(false)
  const [comoRascunho, setComoRascunho] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState({ feito: 0, total: 0, chave: '' })
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null)
  const ocupado = useRef(false)
  const plano = useMemo(() => pacote && existentes ? planejarImportacao(pacote, existentes, { atualizarExistentes, comoRascunho }) : null,
    [pacote, existentes, atualizarExistentes, comoRascunho])
  const grupos = useMemo(() => plano && pacote ? gruposDoPlano(plano, pacote) : [], [plano, pacote])
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
        setComoRascunho(false)
        if (!/\.json$/i.test(arquivo.name)) {
          setErros(['Selecione um arquivo com a extensão .json.'])
          return
        }
        if (arquivo.size > MAX_BYTES_PACOTE) {
          setErros(['O arquivo aceita até 5 MB.'])
          return
        }
        let json: unknown
        try {
          json = JSON.parse(await arquivo.text())
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
    try {
      // Reconsulta a base antes de gravar para reconhecer itens salvos desde a prévia.
      const base = await carregarExistentes(user)
      const planoAtual = planejarImportacao(pacote, base, { atualizarExistentes, comoRascunho })
      const mudou = ([ 'categorias', 'documentos', 'trilha', 'cursos', 'provas', 'checklists' ] as const).some((grupo) =>
        planoAtual[grupo].some((passo, i) => passo.acao !== plano[grupo][i].acao ||
          JSON.stringify(passo.existente) !== JSON.stringify(plano[grupo][i].existente)),
      )
      if (mudou) {
        setExistentes(base)
        setErros(['O conteúdo existente mudou. Confira a nova prévia antes de importar.'])
        return
      }
      const resultado = await importarPacote(planoAtual, {
        salvarCategoria: (form, id) => salvarCategoria(form, [], id),
        salvarDocumento: (form, id) => salvarDocumento(form, user, [], id),
        salvarTrilha: (itens, anteriores) => salvarTrilhaManuais(user, itens, anteriores),
        salvarCurso: (form) => salvarCurso(user, form),
        salvarProva: (form, versao) => salvarProva(user, form, versao),
        salvarModelo: (existente, form) => salvarModelo(user, existente, form),
      }, (feito, chave) => setProgresso({ feito, total, chave }))
      setRelatorio(resultado)
      await atualizar()
      setExistentes(await carregarExistentes(user))
    } catch {
      setExistentes(null)
      setErros(['Não foi possível atualizar a prévia. Carregue o conteúdo existente antes de tentar novamente.'])
    } finally {
      ocupado.current = false
      setImportando(false)
    }
  }

  const bloqueado = lendo || importando
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold">Importar pacote de conteúdo</h1>
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
                        <li key={item.chave} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                          <span className="min-w-0 break-words">{item.nome}</span>
                          <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 font-medium text-ink-soft">{ROTULO_ACAO[item.acao]}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
              <fieldset className="mt-5 space-y-2 rounded-xl bg-paper p-3" disabled={bloqueado}>
                <legend className="px-1 text-sm font-semibold">Opções da importação</legend>
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" className={CAIXA} checked={atualizarExistentes} onChange={(e) => setAtualizarExistentes(e.target.checked)} />
                  Atualizar itens que já existem
                </label>
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
