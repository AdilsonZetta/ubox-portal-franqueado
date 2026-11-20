import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Aviso, Carregando, inputClass } from '../../components/ui'
import { filtrarExecucoes, mediaScore, naoConformidades } from '../../lib/checklist'
import { dataDoInput } from '../../lib/marketing'
import { ListaExecucoes, ListaNaoConformidades, RodapeModulo7, ScoreSelo } from './partes'
import { useChecklist } from './useChecklist'

function useFiltros(diasPadrao: number) {
  const hoje = new Date()
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diasPadrao)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [de, setDe] = useState(iso(inicio))
  const [ate, setAte] = useState('')
  const [modeloId, setModeloId] = useState('')
  const deMs = dataDoInput(de)?.getTime() ?? null
  const ateMs = dataDoInput(ate)?.getTime() ?? null
  return { de, setDe, ate, setAte, modeloId, setModeloId, deMs, ateMs }
}

function Filtros({ f, modelos, extra }: { f: ReturnType<typeof useFiltros>; modelos: { id: string; titulo: string }[]; extra?: ReactNode }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-4">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Checklist</span>
        <select className={inputClass} value={f.modeloId} onChange={(e) => f.setModeloId(e.target.value)}>
          <option value="">Todos</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">De</span>
        <input type="date" className={inputClass} value={f.de} onChange={(e) => f.setDe(e.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Até</span>
        <input type="date" className={inputClass} value={f.ate} onChange={(e) => f.setAte(e.target.value)} />
      </label>
      {extra}
    </div>
  )
}

export function HistoricoChecklistPage() {
  const f = useFiltros(30)
  const [soNc, setSoNc] = useState(false)
  const dados = useChecklist({ deMs: f.deMs, ateMs: f.ateMs })
  const lista = useMemo(() => filtrarExecucoes(dados.execucoes, { modeloId: f.modeloId, soComNaoConformidade: soNc }), [dados.execucoes, f.modeloId, soNc])
  const modelos = useMemo(() => [...new Map(dados.execucoes.map((e) => [e.modeloId, { id: e.modeloId, titulo: e.modeloTitulo }])).values()], [dados.execucoes])
  if (dados.gestor) return <Navigate to="/checklist/gestao?aba=execucoes" replace />
  const media = mediaScore(lista)
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <p className="text-sm text-muted"><Link to="/checklist">Checklist Operacional</Link> / Histórico</p>
      <header className="cabecalho-pagina flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Histórico da unidade</h1>
          <p className="mt-1 text-sm text-muted">Todos os checklists enviados pela unidade, com score e não conformidades.</p>
        </div>
        <div className="text-right text-sm text-muted">
          {lista.length} checklist(s){media !== null ? <> · média <ScoreSelo score={media} /></> : null}
        </div>
      </header>
      <Filtros
        f={f}
        modelos={modelos}
        extra={
          <label className="flex items-end gap-2 pb-2.5 text-sm font-medium">
            <input type="checkbox" checked={soNc} onChange={(e) => setSoNc(e.target.checked)} /> Só com não conformidade
          </label>
        }
      />
      {dados.erro ? <Aviso tom="erro">{dados.erro}</Aviso> : null}
      {dados.carregando ? <Carregando /> : <ListaExecucoes execucoes={lista} />}
      <RodapeModulo7 />
    </div>
  )
}

export function NaoConformidadesPage() {
  const f = useFiltros(30)
  const dados = useChecklist({ deMs: f.deMs, ateMs: f.ateMs })
  const itens = useMemo(() => naoConformidades(filtrarExecucoes(dados.execucoes, { modeloId: f.modeloId })), [dados.execucoes, f.modeloId])
  const modelos = useMemo(() => [...new Map(dados.execucoes.map((e) => [e.modeloId, { id: e.modeloId, titulo: e.modeloTitulo }])).values()], [dados.execucoes])
  if (dados.gestor) return <Navigate to="/checklist/gestao?aba=nc" replace />
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <p className="text-sm text-muted"><Link to="/checklist">Checklist Operacional</Link> / Não conformidades</p>
      <header className="cabecalho-pagina">
        <h1 className="text-3xl font-bold">Não conformidades</h1>
        <p className="mt-1 text-sm text-muted">Itens marcados como Não OK, com a explicação e a evidência registradas. {itens.length} no período.</p>
      </header>
      <Filtros f={f} modelos={modelos} />
      {dados.erro ? <Aviso tom="erro">{dados.erro}</Aviso> : null}
      {dados.carregando ? <Carregando /> : <ListaNaoConformidades itens={itens} />}
      <RodapeModulo7 />
    </div>
  )
}

export { Filtros, useFiltros }
