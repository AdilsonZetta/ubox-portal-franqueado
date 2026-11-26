import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Aviso, Button, Carregando } from '../../components/ui'

export interface Indicador {
  titulo: string
  valor: number | string | null
  detalhe: string
  icone: LucideIcon
  para: string
  parcial?: boolean
}

export const numero = new Intl.NumberFormat('pt-BR')
export const linkPainel = 'rounded-sm font-semibold text-brand-dark hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-dark'

export function Indicadores({ rotulo, itens, carregando, recarregar }: {
  rotulo: string
  itens: Indicador[]
  carregando: boolean
  recarregar: () => void
}) {
  if (!itens.length) return null
  const indisponivel = itens.some((i) => i.valor === null || i.parcial)
  return (
    <div className="space-y-3" aria-busy={carregando}>
      {carregando ? <Carregando texto="Consultando indicadores…" /> : null}
      <ul aria-label={rotulo} className="grid gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {itens.map(({ titulo, valor, detalhe, icone: Icone, para }) => (
          <li key={titulo} className="min-w-0">
            <Link to={para} className="cartao-modulo flex h-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-dark">
              <span className="flex items-center justify-between gap-2">
                <span className="icone-modulo grid size-8 place-items-center rounded-lg">
                  <Icone size={17} aria-hidden="true" />
                </span>
                <ArrowUpRight size={15} className="text-muted" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold leading-snug">{titulo}</span>
              <span className="mt-auto text-2xl font-bold leading-none tabular-nums">
                {typeof valor === 'number' ? numero.format(valor) : valor ?? '—'}
              </span>
              <span className="text-xs leading-relaxed text-ink-soft">
                {carregando ? 'Consultando…' : valor === null ? 'Indisponível' : detalhe}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!carregando && indisponivel ? (
        <Aviso>Alguns indicadores estão indisponíveis. <Button variant="ghost" onClick={recarregar}>Tentar novamente</Button></Aviso>
      ) : null}
    </div>
  )
}
