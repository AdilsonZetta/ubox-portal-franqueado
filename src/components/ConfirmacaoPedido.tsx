import type { ReactNode } from 'react'
import { Button, Selo } from './ui'

export function focarPedido(id: string) {
  const elemento = document.getElementById(id)
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  elemento?.focus({ preventScroll: true })
  elemento?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' })
}

export function ConfirmacaoPedido({ titulo, protocolo, situacao, acompanhar, children }: {
  titulo: string
  protocolo: string
  situacao: string
  acompanhar: () => void
  children?: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-line border-l-4 border-l-lime-dark bg-white p-4 shadow-sm">
      <div role="status" className="space-y-1">
        <h2 className="font-bold text-ink">{titulo}</h2>
        <p className="text-sm text-ink-soft">Protocolo <strong translate="no">{protocolo}</strong></p>
        <p className="flex items-center gap-2 text-sm text-ink-soft">Situação <Selo tom="marca">{situacao}</Selo></p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={acompanhar}>Acompanhar pedido</Button>
        {children}
      </div>
    </section>
  )
}
