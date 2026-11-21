import { Inbox } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function cx(...partes: Array<string | false | null | undefined>): string {
  return partes.filter(Boolean).join(' ')
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const estilos = {
    primary: 'bg-brand text-white hover:bg-brand-dark active:bg-brand-dark',
    secondary: 'bg-surface text-ink border border-line-control hover:border-ink/60',
    ghost: 'bg-transparent text-ink hover:bg-black/5',
    danger: 'bg-surface text-red-700 border border-red-200 hover:bg-red-50',
  }
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 min-h-11 rounded-[10px] px-4 py-2.5 text-sm font-semibold transition-portal motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50',
        estilos[variant],
        className,
      )}
    />
  )
}

export function Campo({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

export const inputClass =
  'w-full rounded-[10px] min-h-11 border border-line-control bg-surface px-3 py-2.5 text-sm text-ink transition-portal motion-reduce:transition-none'

export function Aviso({ tom = 'info', children }: { tom?: 'info' | 'erro' | 'ok'; children: ReactNode }) {
  const estilos = {
    info: 'border-sky-200 bg-sky-50 text-sky-950',
    erro: 'border-red-200 bg-red-50 text-red-900',
    ok: 'border-lime/40 bg-lime/15 text-ink',
  }
  return <div className={cx('rounded-2xl border px-4 py-3 text-sm', estilos[tom])}>{children}</div>
}

// Estrutura adaptada de shadcn/ui Empty (MIT, https://github.com/shadcn-ui/ui)
export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center sm:py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        <span className="mb-1 grid size-11 place-items-center rounded-xl bg-lime-tint text-lime-dark" aria-hidden="true">
          <Inbox className="size-5" />
        </span>
        <p className="text-balance font-semibold text-ink">{titulo}</p>
        <p className="text-sm/relaxed text-ink-soft wrap-anywhere">{texto}</p>
      </div>
      {acao ? <div className="max-w-sm">{acao}</div> : null}
    </div>
  )
}

// Estrutura adaptada de Tremor ProgressBar (Apache-2.0, https://github.com/tremorlabs/tremor)
export function BarraProgresso({ valor, rotulo, legenda, className }: {
  valor: number
  rotulo: string
  legenda?: string
  className?: string
}) {
  return (
    <span className={cx('flex w-full items-center gap-2', className)}>
      <span className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo}>
        <span className="h-full rounded-full bg-lime-dark" style={{ width: `${valor}%` }} />
      </span>
      {legenda ? <span className="shrink-0 text-xs font-medium tabular-nums text-ink-soft">{legenda}</span> : null}
    </span>
  )
}

// Estrutura adaptada de TailAdmin MetricCard (MIT, https://github.com/TailAdmin/free-react-tailwind-admin-dashboard) e shadcn/ui SectionCards (MIT, https://github.com/shadcn-ui/ui)
export function CartaoMetrica({ rotulo, valor, icone, rodape, className }: {
  rotulo: string
  valor: ReactNode
  icone?: ReactNode
  rodape?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('min-w-0 rounded-xl border border-line bg-surface p-3 sm:p-4', className)}>
      {icone ? (
        <span className="mb-3 grid size-9 place-items-center rounded-lg bg-lime-tint text-lime-dark [&>svg]:size-5" aria-hidden="true">
          {icone}
        </span>
      ) : null}
      <dl>
        <dt className="text-sm font-medium text-ink-soft wrap-anywhere">{rotulo}</dt>
        <dd className="mt-1 text-2xl font-bold tabular-nums text-ink sm:text-3xl">{valor}</dd>
      </dl>
      {rodape ? <div className="mt-1 text-xs text-ink-soft">{rodape}</div> : null}
    </div>
  )
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      {texto}
    </div>
  )
}

// Estrutura adaptada de shadcn/ui Badge (MIT, https://github.com/shadcn-ui/ui)
export function Selo({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'marca' | 'lima' | 'alerta' }) {
  const estilos = {
    neutro: 'bg-paper text-ink-soft',
    marca: 'bg-brand-tint text-brand',
    lima: 'bg-lime-tint text-lime-dark',
    alerta: 'bg-brand-soft text-ink',
  }
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium [&>svg]:size-3', estilos[tom])}>{children}</span>
}

export function LinkBotao({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cx('inline-flex items-center justify-center gap-2 min-h-11 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-portal hover:bg-brand-dark active:bg-brand-dark motion-reduce:transition-none', className)}>
      {children}
    </Link>
  )
}
