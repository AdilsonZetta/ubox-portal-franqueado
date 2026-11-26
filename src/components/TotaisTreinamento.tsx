import { totaisTreinamento, type SituacaoTreinamento } from '../lib/adesao'

export function TotaisTreinamento({ pessoas, compacto = false }: { pessoas: { situacao: SituacaoTreinamento }[]; compacto?: boolean }) {
  const totais = Object.entries(totaisTreinamento(pessoas))
  if (compacto) return <p className="text-xs text-muted">{totais.map(([rotulo, total]) => `${rotulo} ${total}`).join(' · ')}</p>
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {totais.map(([rotulo, total]) => (
        <div key={rotulo} className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
          <dt className="text-sm font-medium text-muted">{rotulo}</dt>
          <dd className="text-2xl font-bold tabular-nums text-ink">{total}</dd>
        </div>
      ))}
    </dl>
  )
}
