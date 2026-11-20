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
    primary: 'bg-brand text-white hover:bg-brand-dark',
    secondary: 'bg-surface text-ink border border-line hover:border-ink/30',
    ghost: 'bg-transparent text-ink hover:bg-black/5',
    danger: 'bg-surface text-red-700 border border-red-200 hover:bg-red-50',
  }
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 min-h-11 rounded-[10px] px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
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
  'w-full rounded-[10px] min-h-11 border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none ring-brand/30 transition focus:border-brand focus:ring-2'

export function Aviso({ tom = 'info', children }: { tom?: 'info' | 'erro' | 'ok'; children: ReactNode }) {
  const estilos = {
    info: 'border-sky-200 bg-sky-50 text-sky-950',
    erro: 'border-red-200 bg-red-50 text-red-900',
    ok: 'border-lime/40 bg-lime/15 text-ink',
  }
  return <div className={cx('rounded-2xl border px-4 py-3 text-sm', estilos[tom])}>{children}</div>
}

export function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <span className="mx-auto mb-4 grid size-11 place-items-center rounded-[10px] bg-lime-tint text-lime-dark" aria-hidden="true">
        <Inbox className="size-5" />
      </span>
      <p className="font-semibold text-ink">{titulo}</p>
      <p className="mt-1 text-sm text-muted">{texto}</p>
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

export function Selo({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'marca' | 'lima' | 'alerta' }) {
  const estilos = {
    neutro: 'bg-ink/5 text-ink/80',
    marca: 'bg-brand-tint text-brand',
    lima: 'bg-lime-tint text-lime-dark',
    alerta: 'bg-amber-100 text-amber-900',
  }
  return <span className={cx('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', estilos[tom])}>{children}</span>
}

export function LinkBotao({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cx('inline-flex items-center justify-center gap-2 min-h-11 rounded-[10px] bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark', className)}>
      {children}
    </Link>
  )
}
