import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Selo, cx } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useVisao } from '../../lib/visao'
import {
  CRITERIOS_SAUDE,
  ROTULO_NIVEL,
  ROTULO_STATUS_PASSO,
  passoAtrasado,
  podeGerirAcompanhamento,
  type Nivel,
  type Sinal,
  type StatusPasso,
} from '../../lib/acompanhamento'

export const COR_NIVEL: Record<Nivel | 'neutro', string> = {
  verde: 'bg-lime-dark',
  amarelo: 'bg-amber-400',
  vermelho: 'bg-red-600',
  neutro: 'bg-ink/20',
}

export function SaudeSelo({ nivel, grande = false }: { nivel: Nivel; grande?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full font-bold',
        nivel === 'verde' ? 'bg-lime/25 text-lime-dark' : nivel === 'amarelo' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800',
        grande ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px] uppercase tracking-wide',
      )}
    >
      <span className={cx('h-2 w-2 rounded-full', COR_NIVEL[nivel])} aria-hidden="true" />
      {ROTULO_NIVEL[nivel]}
    </span>
  )
}

export function ListaSinais({ sinais }: { sinais: Sinal[] }) {
  return (
    <ul className="space-y-1.5">
      {sinais.map((s) => (
        <li key={s.chave} className="flex items-start gap-2 text-sm">
          <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', COR_NIVEL[s.nivel])} aria-label={s.nivel} />
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
          <p className="pt-1 text-xs text-ink/50">Calculado no navegador a partir dos dados que a franqueadora já lê. Fontes indisponíveis aparecem em cinza e não entram na cor.</p>
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

export function RodapeModulo9() {
  return <p className="text-center text-[11px] text-ink/35">Módulo 9 construído e revisado pelo Grok Bot no Cursor (o Antigravity estava sem cota nesta rodada).</p>
}
