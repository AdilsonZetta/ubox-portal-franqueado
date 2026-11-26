import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Selo } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { ROTULO_STATUS_PEDIDO, fazEstoque, podeGerirEstoque, situacaoSaldo, type LinhaSaldo, type StatusPedido } from '../../lib/estoque'
import { carregarEstoque, type DadosEstoque } from '../../lib/estoqueApi'
import { useVisao } from '../../lib/visao'
import type { Usuario } from '../../types'

export interface UsoEstoque extends DadosEstoque {
  pessoa: Usuario | null
  gestor: boolean
  participa: boolean
  simulando: boolean
  ehFranqueado: boolean
  carregando: boolean
  erro: string
  recarregar: () => void
}

const VAZIO: DadosEstoque = { itens: [], movimentos: [], contagens: [], pedidos: [] }

/** Dados do estoque para quem está usando. O gestor pode filtrar por unidade; a unidade só vê a si mesma. */
export function useEstoque(unidadeFiltro: string | null = null): UsoEstoque {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const gestor = podeGerirEstoque(user, ehAdmin) && !comoFranqueado
  const participa = fazEstoque(pessoa)
  const [dados, setDados] = useState<DadosEstoque>(VAZIO)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])

  useEffect(() => {
    if (!user || !pessoa || (!gestor && !participa)) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    setErro('')
    const unidade = gestor ? unidadeFiltro : (pessoa.unidadeId ?? '')
    if (!gestor && !unidade) {
      setCarregando(false)
      return
    }
    void carregarEstoque(unidade || null)
      .then((d) => ativo && setDados(d))
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, pessoa, gestor, participa, unidadeFiltro, tique])

  return {
    ...dados,
    pessoa,
    gestor,
    participa,
    simulando: comoFranqueado,
    ehFranqueado: !comoFranqueado && pessoa?.papel === 'franqueado',
    carregando,
    erro,
    recarregar,
  }
}

export function NivelSelo({ linha }: { linha: LinhaSaldo }) {
  const { nivel } = linha
  if (nivel === 'sem_lancamento') return <Selo>{situacaoSaldo(linha)}</Selo>
  if (nivel === 'zerado') return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-800"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{situacaoSaldo(linha)}</span>
  if (nivel === 'baixo') return <Selo tom="alerta">Abaixo do mínimo</Selo>
  return <Selo tom="lima">OK</Selo>
}

export function StatusPedidoSelo({ status }: { status: StatusPedido }) {
  const tom = status === 'recebido' ? 'lima' : status === 'cancelado' ? 'neutro' : status === 'enviado' ? 'marca' : 'alerta'
  return <Selo tom={tom}>{ROTULO_STATUS_PEDIDO[status]}</Selo>
}

