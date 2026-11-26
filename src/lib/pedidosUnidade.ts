import type { Usuario } from '../types'
import { fazMarketing } from './marketing'
import { podeModulo } from './modulosAcesso'

const PREFIXO_PROTOCOLO = { chamado: 'CH-', arte: 'MK-', reposicao: 'RP-' }

export function protocoloDe(tipo: keyof typeof PREFIXO_PROTOCOLO, id: string): string {
  return PREFIXO_PROTOCOLO[tipo] + id.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()
}

interface OpcaoPedido {
  id: 'arte' | 'reposicao' | 'franqueadora'
  titulo: string
  descricao: string
  para: string
}

export function opcoesDePedido(pessoa: Usuario | null, simulando: boolean): OpcaoPedido[] {
  if (!pessoa || (pessoa.papel !== 'franqueado' && pessoa.papel !== 'equipe_franqueado')) return []

  const opcoes: OpcaoPedido[] = []
  if (fazMarketing(pessoa) && podeModulo(pessoa, 'marketing', simulando)) {
    opcoes.push({ id: 'arte', titulo: 'Solicitar uma arte', descricao: 'Peça uma peça de marketing para sua unidade.', para: '/marketing/pedidos?novo=1' })
  }
  if (pessoa.papel === 'franqueado' && podeModulo(pessoa, 'estoque', simulando)) {
    opcoes.push({ id: 'reposicao', titulo: 'Repor um item', descricao: 'Solicite itens para o estoque da unidade.', para: '/estoque?aba=pedidos' })
  }
  if (pessoa.unidadeId && podeModulo(pessoa, 'chamados', simulando)) {
    opcoes.push({ id: 'franqueadora', titulo: 'Falar com a franqueadora', descricao: 'Abra um chamado para tirar dúvidas ou pedir suporte.', para: '/chamados?novo=1' })
  }
  return opcoes
}
