import { useId } from 'react'
import { MessageSquare, Package, Palette } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { opcoesDePedido } from '../lib/pedidosUnidade'
import { useVisao } from '../lib/visao'

const ICONE = { arte: Palette, reposicao: Package, franqueadora: MessageSquare }

export function PedidosUnidade() {
  const tituloId = useId()
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const opcoes = opcoesDePedido(comoFranqueado ? simulado : user, comoFranqueado)
  if (!opcoes.length) return null

  return (
    <section className="my-5 space-y-3" aria-labelledby={tituloId}>
      <h2 id={tituloId} className="text-lg font-bold text-ink">O que você precisa?</h2>
      {comoFranqueado ? (
        <p className="text-sm text-ink-soft">Na simulação você confere as opções da unidade; o envio é feito pela conta da unidade.</p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {opcoes.map(({ id, titulo, descricao, para }) => {
          const Icone = ICONE[id]
          return (
            <li key={id}>
              <Link to={para} className="flex h-full items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-dark">
                <Icone className="mt-0.5 size-5 shrink-0 text-brand-dark" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-bold text-ink">{titulo}</span>
                  <span className="mt-1 block text-sm text-ink-soft">{descricao}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
