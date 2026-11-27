import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../components/ui'
import { agruparPorDia, atrasada, diaLocal, diasDoMes, PRIORIDADES_DEMANDA, semanaDe, STATUS_DEMANDA,
  type Demanda } from '../../lib/demandas'

const mesExtenso = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const dataCompleta = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' })
const diaCurto = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const semana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const statusCor = {
  a_fazer: 'border-l-line-strong', em_andamento: 'border-l-brand',
  aguardando: 'border-l-ink-soft', concluida: 'border-l-lime-dark',
}
const prioridadeCor = {
  baixa: 'bg-lime-dark', media: 'bg-ink-soft', alta: 'bg-brand-dark', urgente: 'bg-red-700',
}

export function CalendarioDemandas({ demandas, hoje, mes, dia, semanal, ajustar, abrir }: {
  demandas: Demanda[]; hoje: string; mes: string; dia: string | null; semanal: boolean
  ajustar: (valores: Record<string, string | null>) => void; abrir: (id: string) => void
}) {
  const [expandidos, setExpandidos] = useState<string[]>([])
  const inicioMes = new Date(`${mes}-01T12:00:00`)
  const ancora = dia?.startsWith(`${mes}-`) && /^\d{4}-\d{2}-\d{2}$/.test(dia) &&
    Number.isFinite(new Date(`${dia}T12:00:00`).getTime()) ? dia : hoje.startsWith(`${mes}-`) ? hoje : `${mes}-01`
  const data = new Date(`${ancora}T12:00:00`)
  const diasMes = diasDoMes(inicioMes.getFullYear(), inicioMes.getMonth() + 1)
  const dias = semanal ? semanaDe(data) : diasMes
  const { porDia, semPrazo } = agruparPorDia(demandas)
  const agenda = diasMes.filter((d) => diaLocal(d).startsWith(`${mes}-`) && porDia.has(diaLocal(d)))
  const temPrazos = dias.some((d) => porDia.has(diaLocal(d)) && (semanal || diaLocal(d).startsWith(`${mes}-`)))

  function navegar(intervalo: number, porSemana = semanal) {
    const proxima = porSemana
      ? new Date(data.getFullYear(), data.getMonth(), data.getDate() + intervalo * 7, 12)
      : new Date(inicioMes.getFullYear(), inicioMes.getMonth() + intervalo, 1, 12)
    const chave = diaLocal(proxima)
    ajustar({ mes: chave.slice(0, 7), dia: porSemana ? chave : null, periodo: porSemana ? 'semana' : null })
  }

  function item(demanda: Demanda) {
    const vencida = atrasada(demanda, hoje)
    const descricao = [demanda.titulo, demanda.unidadeNome, STATUS_DEMANDA[demanda.status],
      `Prioridade ${PRIORIDADES_DEMANDA[demanda.prioridade]}`, vencida ? 'Atrasada' : null].filter(Boolean).join(', ')
    return <li key={demanda.id} className="min-w-0">
      <button type="button" onClick={() => abrir(demanda.id)} aria-label={descricao} title={descricao}
        className={`flex min-h-11 w-full sm:min-h-8 min-w-0 items-start gap-1.5 rounded-md border border-l-4 px-1.5 py-1.5 text-left text-xs font-semibold focus-visible:outline-2 focus-visible:outline-brand-dark ${statusCor[demanda.status]} ${vencida ? 'border-y-red-200 border-r-red-200 bg-red-50 text-red-800 hover:bg-red-100' : 'border-y-line border-r-line bg-paper text-ink hover:bg-line'}`}>
        <span aria-hidden="true" className={`mt-1.5 size-1.5 shrink-0 rounded-full ${prioridadeCor[demanda.prioridade]}`} />
        <span className="min-w-0 wrap-anywhere sm:line-clamp-2">{demanda.titulo}
          {demanda.unidadeNome ? <span className="block text-[11px] font-medium">{demanda.unidadeNome}</span> : null}
          <span className="block text-[11px] font-medium sm:hidden">
            {STATUS_DEMANDA[demanda.status]} · {PRIORIDADES_DEMANDA[demanda.prioridade]}{vencida ? ' · Atrasada' : ''}
          </span>
        </span>
      </button>
    </li>
  }

  return (
    <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_15rem]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Calendário de demandas">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3 sm:p-4">
          <h2 aria-live="polite" className="hidden text-lg font-extrabold first-letter:uppercase sm:block">
            {semanal ? `${diaCurto.format(dias[0])} a ${diaCurto.format(dias[6])}` : mesExtenso.format(inicioMes)}
          </h2>
          <h2 aria-live="polite" className="text-lg font-extrabold first-letter:uppercase sm:hidden">{mesExtenso.format(inicioMes)}</h2>
          <div className="flex flex-wrap items-center gap-1">
            <div role="group" aria-label="Período do calendário" className="mr-2 hidden gap-1 rounded-lg bg-paper p-1 sm:flex">
              <Button variant={semanal ? 'ghost' : 'secondary'} aria-pressed={!semanal}
                onClick={() => ajustar({ periodo: null, dia: null })}>Mês</Button>
              <Button variant={semanal ? 'secondary' : 'ghost'} aria-pressed={semanal}
                onClick={() => ajustar({ periodo: 'semana' })}>Semana</Button>
            </div>
            <span className="hidden sm:inline-flex"><Button variant="ghost" aria-label={semanal ? 'Semana anterior' : 'Mês anterior'}
              onClick={() => navegar(-1)}><ChevronLeft className="size-4" aria-hidden="true" /></Button></span>
            <span className="inline-flex sm:hidden"><Button variant="ghost" aria-label="Mês anterior"
              onClick={() => navegar(-1, false)}>
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button></span>
            <Button variant="secondary" onClick={() => ajustar({ mes: hoje.slice(0, 7), dia: semanal ? hoje : null })}>Hoje</Button>
            <span className="hidden sm:inline-flex"><Button variant="ghost" aria-label={semanal ? 'Próxima semana' : 'Próximo mês'}
              onClick={() => navegar(1)}><ChevronRight className="size-4" aria-hidden="true" /></Button></span>
            <span className="inline-flex sm:hidden"><Button variant="ghost" aria-label="Próximo mês"
              onClick={() => navegar(1, false)}>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button></span>
          </div>
        </header>
        <div className="hidden sm:block">
          <div className="grid grid-cols-7 border-b border-line bg-paper text-center text-xs font-semibold text-ink-soft" aria-hidden="true">
            {semana.map((nome) => <span key={nome} className="p-2">{nome}</span>)}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((d) => {
              const chave = diaLocal(d)
              const externa = !semanal && !chave.startsWith(`${mes}-`)
              const itens = externa ? [] : porDia.get(chave) ?? []
              const expandido = expandidos.includes(chave)
              const nomeData = dataCompleta.format(d)
              return <section key={chave} aria-label={nomeData} className={`min-h-26 min-w-0 border-b border-r border-line p-1 nth-[7n]:border-r-0 lg:p-2 ${externa ? 'bg-paper text-muted' : ''}`}>
                <time dateTime={chave} aria-label={nomeData} aria-current={chave === hoje ? 'date' : undefined}
                  className={`mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${chave === hoje ? 'bg-ink text-white' : ''}`}>{d.getDate()}</time>
                <ul className="space-y-1">{(expandido ? itens : itens.slice(0, 3)).map(item)}</ul>
                {itens.length > 3 ? <button type="button" aria-expanded={expandido}
                  aria-label={`${expandido ? 'Mostrar menos' : `Mostrar mais ${itens.length - 3} demandas`} em ${nomeData}`}
                  onClick={() => setExpandidos(expandido ? expandidos.filter((valor) => valor !== chave) : [...expandidos, chave])}
                  className="mt-1 min-h-8 rounded px-1 text-left text-xs font-bold text-ink-soft hover:bg-paper focus-visible:outline-2 focus-visible:outline-brand-dark">
                  {expandido ? 'Mostrar menos' : `+${itens.length - 3} mais`}
                </button> : null}
              </section>
            })}
          </div>
          {!temPrazos ? <p className="p-4 text-sm text-muted">Nenhuma demanda com prazo neste período. Navegue para outro período ou ajuste os filtros.</p> : null}
        </div>
        <div className="divide-y divide-line sm:hidden">
          {agenda.length ? agenda.map((d) => {
            const chave = diaLocal(d)
            return <section key={chave} className="space-y-2 p-3">
              <h3 className="text-sm font-bold first-letter:uppercase"><time dateTime={chave}>{dataCompleta.format(d)}</time></h3>
              <ul className="space-y-1">{porDia.get(chave)?.map(item)}</ul>
            </section>
          }) : <p className="p-4 text-sm text-muted">Nenhuma demanda com prazo neste mês. Navegue para outro mês ou ajuste os filtros.</p>}
        </div>
      </section>
      <aside className="space-y-3 rounded-2xl border border-line bg-surface p-4" aria-label="Demandas sem prazo">
        <h2 className="flex items-center gap-2 text-sm font-extrabold"><CalendarDays aria-hidden="true" className="size-4 text-muted" />
          Sem prazo <span className="ml-auto rounded-full bg-paper px-2 py-0.5 text-xs tabular-nums">{semPrazo.length}</span>
        </h2>
        {semPrazo.length ? <ul className="space-y-1">{semPrazo.map(item)}</ul>
          : <p className="text-sm text-muted">As demandas sem data aparecem aqui.</p>}
      </aside>
    </div>
  )
}
