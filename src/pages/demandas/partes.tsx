import { useEffect, useId, useState, type ReactNode } from 'react'
import { CalendarDays, Plus, X } from 'lucide-react'
import { AREAS } from '../../data/areas'
import { Aviso, Button, Carregando, Selo } from '../../components/ui'
import { atrasada, PRIORIDADES_DEMANDA, type Demanda } from '../../lib/demandas'
import type { PessoaRede } from '../../lib/demandasSupabase'
import { useFocusTrap } from '../../lib/focusTrap'
import { formatarDia } from '../../lib/format'

export interface ConsultaDemandas<T> {
  dados?: T
  erro?: boolean
  carregando: boolean
  recarregar: () => void
}

export function useConsultaDemandas<T>(consultar: () => Promise<T>): ConsultaDemandas<T> {
  const [versao, setVersao] = useState(0)
  const [resultado, setResultado] = useState<Omit<ConsultaDemandas<T>, 'recarregar'>>({ carregando: true })
  useEffect(() => {
    let ativa = true
    void consultar()
      .then((dados) => { if (ativa) setResultado({ dados, carregando: false }) })
      .catch(() => { if (ativa) setResultado((anterior) => ({ ...anterior, erro: true, carregando: false })) })
    return () => { ativa = false }
  }, [consultar, versao])
  function recarregar() {
    setResultado((anterior) => ({ dados: anterior.dados, carregando: true }))
    setVersao((v) => v + 1)
  }
  return { ...resultado, recarregar }
}

export function EstadoConsulta({ erro, recarregar, texto, falha }: {
  erro?: boolean; recarregar: () => void; texto: string; falha: string
}) {
  return erro ? (
    <Aviso tom="erro">
      <span role="alert">{falha}</span>{' '}
      <Button variant="ghost" onClick={recarregar}>Tentar novamente</Button>
    </Aviso>
  ) : <Carregando texto={texto} />
}

export function PainelDemanda({ titulo, fechar, ocupado, children }: {
  titulo: string; fechar: () => void; ocupado?: boolean; children: ReactNode
}) {
  const ref = useFocusTrap<HTMLDialogElement>(true)
  const id = useId()
  useEffect(() => {
    const dialogo = ref.current
    dialogo?.showModal()
    return () => dialogo?.close()
  }, [ref])

  return (
    <dialog ref={ref} aria-labelledby={id} onCancel={(e) => {
      e.preventDefault()
      if (!ocupado) fechar()
    }} className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-2xl overflow-y-auto overscroll-contain border-l border-line bg-surface text-ink shadow-xl backdrop:bg-ink/55">
      <div className="flex items-start justify-between gap-4 border-b border-line bg-paper p-4 sm:p-6">
        <h2 id={id} className="min-w-0 wrap-anywhere text-xl font-extrabold">{titulo}</h2>
        <Button type="button" variant="ghost" aria-label="Fechar painel" disabled={ocupado} onClick={fechar}>
          <X className="size-5" aria-hidden="true" />
        </Button>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </dialog>
  )
}

export const acaoDemandaClass = 'text-ink! hover:bg-brand/85! active:bg-brand/85!'

export function NovaDemandaBotao({ abrir }: { abrir: () => void }) {
  return <Button className={acaoDemandaClass} onClick={abrir}><Plus className="size-4" aria-hidden="true" /> Nova demanda</Button>
}

export function MetadadosDemanda({ demanda, hoje }: { demanda: Demanda; hoje: string }) {
  const vencida = atrasada(demanda, hoje)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {demanda.area ? <Selo>{AREAS[demanda.area]}</Selo> : null}
      <Selo tom={demanda.prioridade === 'urgente' ? 'alerta' : demanda.prioridade === 'alta' ? 'marca' : 'neutro'}>
        {PRIORIDADES_DEMANDA[demanda.prioridade]}
      </Selo>
      {demanda.prazo ? (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${vencida ? 'text-red-700' : 'text-muted'}`}>
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <time dateTime={demanda.prazo}>{formatarDia(new Date(`${demanda.prazo}T12:00:00`), 'short')}</time>
          {vencida ? ' · Atrasada' : null}
        </span>
      ) : null}
    </div>
  )
}

export function IniciaisResponsaveis({ ids, pessoas }: { ids: string[]; pessoas: Map<string, PessoaRede> }) {
  return (
    <span className="flex flex-wrap gap-1">
      {ids.slice(0, 4).map((id) => {
        const nome = pessoas.get(id)?.nome || 'Pessoa indisponível'
        return <span key={id} title={nome} className="grid size-7 place-items-center rounded-full bg-paper text-xs font-bold text-ink-soft">
          <span className="sr-only">{nome}</span>
          <span aria-hidden="true">{pessoas.has(id) ? nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() : '—'}</span>
        </span>
      })}
      {ids.length > 4 ? <span className="self-center text-xs text-muted">+{ids.length - 4}</span> : null}
    </span>
  )
}
