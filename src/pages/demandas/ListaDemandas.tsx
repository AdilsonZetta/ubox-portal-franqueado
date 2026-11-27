import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Selo } from '../../components/ui'
import { atrasada, COLUNAS_LISTA_DEMANDAS, nomesResponsaveis, ordenarListaDemandas, PRIORIDADES_DEMANDA, STATUS_DEMANDA,
  type ColunaListaDemandas, type Demanda } from '../../lib/demandas'
import { formatarDia } from '../../lib/format'

export function ListaDemandas({ demandas, hoje, link, ordem, ordenar }: {
  demandas: Demanda[]; hoje: string; link: (id: string) => string
  ordem: string | null; ordenar: (ordem: string) => void
}) {
  const [campo, direcao] = (ordem ?? '').split(':')
  const coluna = Object.hasOwn(COLUNAS_LISTA_DEMANDAS, campo) ? campo as ColunaListaDemandas : 'prazo'
  const inversa = direcao === 'desc'
  const lista = ordenarListaDemandas(demandas, coluna, inversa)
  return (
    <div role="region" aria-label="Lista de demandas" tabIndex={0} className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-160 text-left text-sm">
        <caption className="sr-only">Demandas. Use os cabeçalhos para ordenar a lista.</caption>
        <thead className="border-b border-line bg-paper text-xs font-semibold text-ink-soft">
          <tr>{Object.entries(COLUNAS_LISTA_DEMANDAS).map(([valor, nome]) => {
            const ativa = valor === coluna
            const Icone = ativa ? (inversa ? ChevronDown : ChevronUp) : ChevronsUpDown
            return <th key={valor} scope="col" aria-sort={ativa ? (inversa ? 'descending' : 'ascending') : undefined}>
              <button type="button" className="flex min-h-11 w-full items-center gap-1.5 p-3 text-left hover:bg-line"
                onClick={() => ordenar(`${valor}:${ativa && !inversa ? 'desc' : 'asc'}`)}>
                {nome}<Icone className="size-3.5 shrink-0" aria-hidden="true" />
              </button>
            </th>
          })}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lista.map((d) => <tr key={d.id} className="align-top hover:bg-paper/60">
            <td className="max-w-64 min-w-36 wrap-anywhere p-3">
              <Link to={link(d.id)} className="font-bold text-ink underline-offset-4 hover:underline">{d.titulo}</Link>
            </td>
            <td className={`whitespace-nowrap p-3 tabular-nums ${atrasada(d, hoje) ? 'text-red-700' : 'text-muted'}`}>
              {d.prazo ? <time dateTime={d.prazo}>{formatarDia(new Date(`${d.prazo}T12:00:00`), 'short')}</time> : 'Sem prazo'}
              {atrasada(d, hoje) ? <span className="block text-xs">Atrasada</span> : null}
            </td>
            <td className="p-3 whitespace-nowrap"><Selo>{STATUS_DEMANDA[d.status]}</Selo></td>
            <td className="p-3">{PRIORIDADES_DEMANDA[d.prioridade]}</td>
            <td className="max-w-48 wrap-anywhere p-3">{d.destino === 'interna' ? 'Interna' : d.unidadeNome ?? 'Unidade'}</td>
            <td className="max-w-56 wrap-anywhere p-3 text-muted">
              {nomesResponsaveis(d) || 'Sem responsáveis individuais'}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>
  )
}
