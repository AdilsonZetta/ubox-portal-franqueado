import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { useVisao } from '../../lib/visao'
import { fazCliente, ROTULO_SITUACAO, type Cliente, type Cobranca, type Painel, type SituacaoCobranca } from '../../lib/cliente'
import { carregarClientes, carregarCobrancasDaUnidade } from '../../lib/clienteApi'
import type { Usuario } from '../../types'

export interface UsoClientes {
  pessoa: Usuario | null
  participa: boolean
  clientes: Cliente[]
  paineis: Map<string, Painel>
  cobrancas: Map<string, Cobranca[]>
  carregando: boolean
  erro: string
  recarregar: () => void
}

/** Só a unidade (franqueado/equipe com o módulo) carrega: a franqueadora e a simulação do admin não leem nada deste módulo. */
export function useClientes({ incluirCobrancas = true } = {}): UsoClientes {
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const pessoa = comoFranqueado ? null : user
  const participa = fazCliente(pessoa)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [paineis, setPaineis] = useState<Map<string, Painel>>(new Map())
  const [cobrancas, setCobrancas] = useState<Map<string, Cobranca[]>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])

  useEffect(() => {
    if (!pessoa || !participa) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    setErro('')
    void carregarClientes(pessoa.unidadeId ?? '')
      .then(async (r) => {
        const ativos = new Map([...r.paineis].filter(([id]) => r.clientes.some((c) => c.id === id && c.status === 'ativo')))
        const cob = incluirCobrancas ? await carregarCobrancasDaUnidade(ativos) : new Map<string, Cobranca[]>()
        if (ativo) { setClientes(r.clientes); setPaineis(r.paineis); setCobrancas(cob) }
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => { ativo = false }
  }, [pessoa, participa, tique, incluirCobrancas])

  return { pessoa, participa, clientes, paineis, cobrancas, carregando, erro, recarregar }
}

const COR_SITUACAO: Record<SituacaoCobranca, string> = {
  pago: 'bg-lime-100 text-lime-800',
  pendente: 'bg-amber-100 text-amber-800',
  atrasado: 'bg-red-100 text-red-700',
}

export function SituacaoSelo({ s }: { s: SituacaoCobranca }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${COR_SITUACAO[s]}`}>{ROTULO_SITUACAO[s]}</span>
}

export function Numero({ rotulo, valor, dica, alerta }: { rotulo: string; valor: string; dica?: string; alerta?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">{rotulo}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${alerta ? 'text-red-700' : ''}`}>{valor}</p>
      {dica ? <p className="text-xs text-ink/50">{dica}</p> : null}
    </div>
  )
}

export const diaDe = (ms: number) => {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
