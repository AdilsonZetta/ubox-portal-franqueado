import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Selo, cx } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useVisao } from '../../lib/visao'
import {
  CRITERIOS_SAUDE,
  ROTULO_CLASSIFICACAO,
  ROTULO_STATUS_PASSO,
  passoAtrasado,
  podeGerirAcompanhamento,
  type Classificacao,
  type Sinal,
  type StatusPasso,
} from '../../lib/acompanhamento'

export const COR_NIVEL: Record<Classificacao | Sinal['nivel'], string> = {
  verde: 'bg-lime-dark',
  amarelo: 'bg-amber-400',
  vermelho: 'bg-red-600',
  neutro: 'bg-ink/20',
  insuficiente: 'bg-slate-500',
  indisponivel: 'bg-slate-500',
}

export function SaudeSelo({ nivel, grande = false }: { nivel: Classificacao; grande?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full font-bold',
        nivel === 'verde' ? 'bg-lime/25 text-lime-dark' : nivel === 'amarelo' ? 'bg-amber-100 text-amber-900' : nivel === 'vermelho' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700',
        grande ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px] uppercase tracking-wide',
      )}
    >
      <span className={cx('h-2 w-2 shrink-0 rounded-full', COR_NIVEL[nivel])} aria-hidden="true" />
      {ROTULO_CLASSIFICACAO[nivel]}
    </span>
  )
}

export function ListaSinais({ sinais }: { sinais: Sinal[] }) {
  return (
    <ul className="space-y-1.5">
      {sinais.map((s) => (
        <li key={s.chave} className="flex items-start gap-2 text-sm">
          <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', COR_NIVEL[s.nivel])} role="img" aria-label={s.nivel === 'indisponivel' ? 'Indisponível' : s.nivel === 'neutro' ? 'Informativo' : ROTULO_CLASSIFICACAO[s.nivel]} />
          <span><span className="font-semibold">{s.rotulo}:</span> <span className="text-ink/70">{s.detalhe}</span></span>
        </li>
      ))}
    </ul>
  )
}

export function CriteriosSaude() {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="rounded-2xl border border-line bg-white">
      <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold">
        Como a saúde da unidade é calculada
        <ChevronDown className={cx('h-4 w-4 transition', aberto && 'rotate-180')} aria-hidden="true" />
      </button>
      {aberto ? (
        <dl className="space-y-1.5 border-t border-line px-4 py-3 text-sm">
          {CRITERIOS_SAUDE.map((c) => (
            <div key={c.rotulo}>
              <dt className="inline font-semibold">{c.rotulo}: </dt>
              <dd className="inline text-ink/70">{c.regra}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

export function StatusPassoSelo({ status, prazoMs }: { status: StatusPasso; prazoMs: number }) {
  if (passoAtrasado({ status, prazoMs }, Date.now()))
    return <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-800">Atrasado · {ROTULO_STATUS_PASSO[status]}</span>
  return <Selo tom={status === 'validado' ? 'lima' : status === 'concluido_unidade' ? 'marca' : 'alerta'}>{ROTULO_STATUS_PASSO[status]}</Selo>
}

export function useAcessoAcompanhamento() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado } = useVisao()
  return { gestor: podeGerirAcompanhamento(user, ehAdmin) && !comoFranqueado, ehAdmin }
}
