import type { Usuario } from '../types'
import { fazChecklist } from './checklist'
import { fazEstoque } from './estoque'
import { fazTrilha } from './manuaisTrilha'
import { fazMarketing } from './marketing'
import { podeModulo } from './modulosAcesso'
import { pontuarBusca, termos } from './text'

export type ModoBusca = 'buscar' | 'perguntar'

export function destinoDaBusca(texto: string, modo: ModoBusca): string | null {
  const consulta = texto.trim()
  if (!consulta) return null
  const rota = modo === 'perguntar' ? '/pergunte' : '/busca'
  return `${rota}?q=${encodeURIComponent(consulta)}`
}

export interface AcaoPortal {
  id: string
  titulo: string
  descricao: string
  to: string
  palavras: string[]
}

const acoes: Array<AcaoPortal & { modulo: string; papelPermitido?: (pessoa: Usuario) => boolean }> = [
  {
    id: 'abrir-chamado', titulo: 'Abrir chamado', descricao: 'Envie uma solicitação à franqueadora.',
    to: '/chamados', palavras: ['suporte', 'problema', 'ajuda'], modulo: 'chamados', papelPermitido: fazTrilha,
  },
  {
    id: 'acompanhar-chamados', titulo: 'Acompanhar chamados', descricao: 'Confira as respostas e o andamento dos chamados.',
    to: '/chamados', palavras: ['suporte', 'resposta', 'andamento'], modulo: 'chamados',
  },
  {
    id: 'fazer-checklist', titulo: 'Fazer checklist', descricao: 'Registre a execução de uma rotina da unidade.',
    to: '/checklist', palavras: ['abertura', 'abrir a loja', 'fechamento', 'rotina'], modulo: 'checklist', papelPermitido: fazChecklist,
  },
  {
    id: 'historico-checklist', titulo: 'Ver histórico do checklist', descricao: 'Consulte as rotinas já registradas.',
    to: '/checklist/historico', palavras: ['execuções', 'rotina', 'não conformidades'], modulo: 'checklist',
  },
  {
    id: 'solicitar-arte', titulo: 'Solicitar uma arte', descricao: 'Peça um material de divulgação para a unidade.',
    to: '/marketing/pedidos', palavras: ['marketing', 'pedido', 'divulgação'], modulo: 'marketing', papelPermitido: fazMarketing,
  },
  {
    id: 'lancar-estoque', titulo: 'Lançar estoque', descricao: 'Registre movimentações e contagens da unidade.',
    to: '/estoque', palavras: ['contagem', 'inventário', 'entrada', 'saída'], modulo: 'estoque', papelPermitido: fazEstoque,
  },
  {
    id: 'continuar-trilha', titulo: 'Continuar a trilha de manuais', descricao: 'Abra o próximo manual disponível na trilha.',
    to: '/manuais/trilha', palavras: ['trilha', 'manual', 'treinamento', 'leitura'], modulo: 'manuais', papelPermitido: fazTrilha,
  },
  {
    id: 'pergunte', titulo: 'Pergunte ao portal', descricao: 'Faça uma pergunta sobre a operação.',
    to: '/pergunte', palavras: ['dúvida', 'pergunta', 'orientação'], modulo: 'manuais',
  },
]

export function acoesDoPortal(pessoa: Usuario | null | undefined, { ehAdmin, simulando }: { ehAdmin: boolean; simulando: boolean }): AcaoPortal[] {
  if (!pessoa) return []
  return acoes.filter(({ modulo, papelPermitido }) =>
    ((ehAdmin && !simulando) || podeModulo(pessoa, modulo, simulando)) &&
    (!papelPermitido || papelPermitido(pessoa)),
  ).map(({ id, titulo, descricao, to, palavras }) => ({ id, titulo, descricao, to, palavras }))
}

const termosGenericosAcao = new Set(['abrir', 'fazer', 'ver', 'como', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'ao', 'os', 'as', 'um', 'uma'])

export function buscarAcoes(q: string, acoes: AcaoPortal[]): AcaoPortal[] {
  const consulta = termos(q).filter((termo) => !termosGenericosAcao.has(termo)).join(' ')
  if (!consulta) return []
  return acoes.map((acao) => ({ acao, pontos: pontuarBusca(consulta, acao.titulo, acao.palavras.join(' ')) }))
    .filter(({ pontos }) => pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .map(({ acao }) => acao)
}
