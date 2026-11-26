import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Camera, MessageSquareText } from 'lucide-react'
import { Aviso, Button, Carregando, Selo, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import {
  RESULTADOS,
  ROTULO_FREQ,
  ROTULO_RESULTADO,
  ROTULO_TIPO_CK,
  calcularTotais,
  fazChecklist,
  liberacaoChecklist,
  porSecao,
  horaRascunho,
  periodoRascunho,
  validarExecucao,
  type ModeloChecklist,
  type Resposta,
  type Resultado,
} from '../../lib/checklist'
import { enviarExecucao, lerModelo } from '../../lib/checklistApi'
import { useVisao } from '../../lib/visao'
import { ScoreSelo } from './partes'
import { useRelogioChecklist } from './useChecklist'
import { useRascunhoChecklist } from './useRascunhoChecklist'
import type { Usuario } from '../../types'

const COR_RESULTADO: Record<Resultado, string> = {
  ok: 'border-lime-dark bg-lime/25 text-lime-dark',
  nao_ok: 'border-red-600 bg-red-50 text-red-700',
  na: 'border-ink/40 bg-ink/5 text-ink/70',
}

export function PreencherChecklistPage() {
  const { modeloId = '' } = useParams()
  return <PreencherChecklist key={modeloId} modeloId={modeloId} />
}

function PreencherChecklist({ modeloId }: { modeloId: string }) {
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const [modelo, setModelo] = useState<ModeloChecklist | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [tique, setTique] = useState(0)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErroCarga('')
    lerModelo(modeloId)
      .then((m) => {
        if (!ativo) return
        setModelo(m && m.ativo ? m : null)
      })
      .catch((falha) => ativo && setErroCarga(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [modeloId, tique])

  const agora = useRelogioChecklist()
  const periodo = modelo ? periodoRascunho(modelo.frequencia, agora) : ''
  const liberacao = modelo ? liberacaoChecklist(modelo, new Date(agora)) : null
  if (!user) return null
  if (comoFranqueado) return <Aviso>Na simulação não é possível preencher checklists.</Aviso>
  if (!fazChecklist(user)) return <Aviso>O checklist é preenchido pelas unidades.</Aviso>

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28">
      <p className="text-sm text-ink/50">
        <Link to="/checklist">Checklist Operacional</Link> / Preencher
      </p>
      {carregando ? <Carregando texto="Abrindo o checklist…" /> : null}
      {erroCarga ? <Aviso tom="erro"><p role="alert">{erroCarga}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => setTique((t) => t + 1)}>Tentar novamente</Button></Aviso> : null}
      {!carregando && !erroCarga && !modelo ? <Aviso>Este checklist está indisponível. Volte para escolher outro modelo.</Aviso> : null}
      {!carregando && !erroCarga && modelo && liberacao && !liberacao.liberado ? (
        <section className="space-y-3" aria-live="polite">
          <h1 className="text-3xl font-extrabold">{modelo.titulo}</h1>
          <Aviso>
            <p>Esta rotina pode ser preenchida a partir das {liberacao.horario} (horário de Brasília). Volte nesse horário.</p>
            <Link to="/checklist" className="mt-2 inline-block font-semibold underline">Voltar às rotinas</Link>
          </Aviso>
        </section>
      ) : null}
      {!carregando && !erroCarga && modelo && liberacao?.liberado ? (
        <FormularioChecklist
          key={JSON.stringify([user.uid, user.unidadeId, modelo.id, modelo.versao, periodo])}
          user={user}
          modelo={modelo}
          periodo={periodo}
        />
      ) : null}
    </div>
  )
}

function FormularioChecklist({ user, modelo, periodo }: { user: Usuario; modelo: ModeloChecklist; periodo: string }) {
  const navegar = useNavigate()
  const rascunho = useRascunhoChecklist(user, modelo, periodo)
  const { respostas, obsGeral } = rascunho
  const [enviando, setEnviando] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [erro, setErro] = useState('')
  const [errosItem, setErrosItem] = useState<Record<string, string>>({})
  const [tentou, setTentou] = useState(false)

  const totais = useMemo(() => calcularTotais(respostas), [respostas])
  const respondidos = respostas.filter((r) => r.resultado).length
  const grupos = useMemo(() => porSecao(modelo.itens), [modelo])

  useEffect(() => {
    if (!tentou) return
    const v = validarExecucao(modelo, respostas)
    setErrosItem(v.porItem)
  }, [tentou, modelo, respostas])

  function mudar(indice: number, parte: Partial<Resposta>) {
    setErro('')
    rascunho.atualizar((atual) => ({
      ...atual,
      respostas: atual.respostas.map((r, i) => i === indice
        ? { ...r, ...parte, ...(parte.resultado === 'na' ? { obs: '', evidenciaUrl: '' } : {}) }
        : r),
    }))
  }

  async function enviar() {
    if (enviando || descartando || !liberacaoChecklist(modelo, new Date()).liberado) return
    setTentou(true)
    const v = validarExecucao(modelo, respostas)
    setErrosItem(v.porItem)
    if (v.gerais.length) {
      setErro(v.gerais.join(' '))
      const primeiro = grupos.flatMap((grupo) => grupo.itens).find(({ item }) => v.porItem[item.id])
      if (primeiro) {
        const alvo = document.getElementById(`item-${primeiro.item.id}`)
        alvo?.focus({ preventScroll: true })
        alvo?.scrollIntoView({ block: 'center' })
      }
      return
    }
    setEnviando(true)
    setErro('')
    try {
      await rascunho.pausar()
      const id = await enviarExecucao(user, modelo, respostas, obsGeral)
      await rascunho.remover().catch(() => undefined)
      navegar(`/checklist/execucao/${id}`, { replace: true, state: { enviado: true } })
    } catch (falha) {
      rascunho.continuar()
      const mensagem = falha && typeof falha === 'object' && 'message' in falha && typeof falha.message === 'string'
        ? falha.message
        : ''
      if (/pode ser enviado a partir de/i.test(mensagem)) {
        setErro(mensagem)
      } else if (falha && typeof falha === 'object' && 'code' in falha && falha.code === '42501') {
        setErro('O banco recusou o envio. Confira com a franqueadora se o preenchimento está liberado e tente novamente.')
      } else {
        setErro(`${mensagemErro(falha)} Se o checklist foi atualizado pela franqueadora, recarregue a página.`)
      }
    } finally {
      setEnviando(false)
    }
  }

  async function descartar() {
    if (!window.confirm('Descartar as respostas salvas e começar do zero?')) return
    setDescartando(true)
    setErro('')
    try {
      await rascunho.recomecar()
      setTentou(false)
      setErrosItem({})
    } catch {
      setErro('Não foi possível descartar as respostas salvas. Tente novamente.')
    } finally {
      setDescartando(false)
    }
  }

  if (rascunho.carregando) return <Carregando texto="Buscando respostas salvas…" />

  return (
    <>
      <header>
        <div className="flex flex-wrap gap-1.5">
          <Selo tom="marca">{ROTULO_TIPO_CK[modelo.tipo]}</Selo>
          <Selo>{ROTULO_FREQ[modelo.frequencia]}</Selo>
          <Selo>Versão {modelo.versao}</Selo>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold">{modelo.titulo}</h1>
        {modelo.descricao ? <p className="mt-1 text-sm text-ink/65">{modelo.descricao}</p> : null}
        <p className="mt-1 text-xs text-ink/50">Marque cada item. Itens Não OK pedem uma explicação. Os marcados com câmera pedem o link da foto (Drive, por exemplo). Itens marcados como Não se aplica dispensam foto e observação.</p>
      </header>

      {rascunho.retomado ? (
        <Aviso>
          <p>Retomamos as respostas salvas às {horaRascunho(rascunho.retomado)}.</p>
          <Button type="button" variant="secondary" className="mt-2" disabled={enviando || descartando} onClick={() => void descartar()}>
            {descartando ? 'Descartando…' : 'Começar do zero'}
          </Button>
        </Aviso>
      ) : null}

      <fieldset disabled={enviando || descartando} className="min-w-0 space-y-5">
        {grupos.map((g) => (
          <section key={g.secao || 'geral'} className="space-y-2">
            {g.secao ? <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-ink/55">{g.secao}</h2> : null}
            <ol className="space-y-2">
              {g.itens.map(({ item, indice }) => {
                const r = respostas[indice]
                if (!r) return null
                const erroItem = errosItem[item.id]
                return (
                  <li key={item.id} id={`item-${item.id}`} tabIndex={-1} aria-describedby={erroItem ? `erro-item-${item.id}` : undefined} className={cx('rounded-2xl border bg-white p-4 shadow-sm', erroItem ? 'border-red-300' : 'border-line')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{indice + 1}. {item.texto}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink/50">
                          <span>Peso {item.peso}</span>
                          {item.exigeEvidencia ? <span className="inline-flex items-center gap-1"><Camera className="h-3 w-3" aria-hidden="true" /> {r.resultado === 'na' ? 'evidência dispensada' : 'exige evidência'}</span> : null}
                          {item.exigeObs ? <span className="inline-flex items-center gap-1"><MessageSquareText className="h-3 w-3" aria-hidden="true" /> {r.resultado === 'na' ? 'observação dispensada' : 'exige observação'}</span> : null}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Resultado do item ${indice + 1}`}>
                        {RESULTADOS.map((res) => (
                          <button
                            key={res}
                            type="button"
                            aria-pressed={r.resultado === res}
                            onClick={() => mudar(indice, { resultado: res })}
                            className={cx('min-w-16 rounded-xl border px-3 py-1.5 text-sm font-bold', r.resultado === res ? COR_RESULTADO[res] : 'border-line text-ink/60 hover:border-ink/30')}
                          >
                            {res === 'na' ? 'Não se aplica' : ROTULO_RESULTADO[res]}
                          </button>
                        ))}
                      </div>
                    </div>
                    {r.resultado === 'na' ? (
                      <p className="mt-2 text-xs text-ink-soft">Não se aplica: foto e observação dispensadas.</p>
                    ) : r.resultado || item.exigeObs || item.exigeEvidencia ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input
                          className={inputClass}
                          maxLength={500}
                          placeholder={r.resultado === 'nao_ok' ? 'O que não está OK? (obrigatório)' : 'Observação'}
                          aria-label={`Observação do item ${indice + 1}`}
                          value={r.obs}
                          onChange={(e) => mudar(indice, { obs: e.target.value })}
                        />
                        <input
                          className={inputClass}
                          maxLength={600}
                          placeholder={item.exigeEvidencia ? 'Link da foto/evidência (obrigatório)' : 'Link da foto/evidência (opcional)'}
                          aria-label={`Evidência do item ${indice + 1}`}
                          value={r.evidenciaUrl}
                          onChange={(e) => mudar(indice, { evidenciaUrl: e.target.value })}
                        />
                      </div>
                    ) : null}
                    {erroItem ? <p id={`erro-item-${item.id}`} className="mt-2 text-xs font-semibold text-red-700">{erroItem}</p> : null}
                  </li>
                )
              })}
            </ol>
          </section>
        ))}

        <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Observação geral (opcional)</span>
            <textarea className={inputClass} rows={3} maxLength={2000} value={obsGeral} onChange={(e) => {
              const obs = e.target.value
              rascunho.atualizar((atual) => ({ ...atual, obsGeral: obs }))
            }} />
          </label>
        </section>
      </fieldset>
      {erro ? <Aviso tom="erro"><p role="alert">{erro}</p></Aviso> : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur lg:left-[272px]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <ScoreSelo score={totais.score} />
            <span className="text-ink/60">
              {respondidos < respostas.length ? `Faltam ${respostas.length - respondidos} de ${respostas.length} itens · ` : 'Todos os itens respondidos · '} {totais.qtdNaoOk} não OK · {totais.qtdNa} N/A
            </span>
            <span aria-live="polite" className="text-xs text-ink-soft">{rascunho.status}</span>
          </div>
          <Button type="button" onClick={() => void enviar()} disabled={enviando || descartando}>{enviando ? 'Enviando…' : 'Enviar checklist'}</Button>
        </div>
      </div>
    </>
  )
}
