import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Boxes,
  Building2,
  GraduationCap,
  KeyRound,
  Library,
  LifeBuoy,
  Megaphone,
  ScanLine,
  ShieldCheck,
  Store,
  Users,
  Wallet,
} from 'lucide-react'

export interface Modulo {
  slug: string
  nome: string
  descricao: string
  grupo: string
  icon: LucideIcon
  ativo?: boolean
  para?: string
  recursos: string[]
}

export const GRUPOS = [
  'Operação da Unidade',
  'Conhecimento e Treinamento',
  'Expansão e Implantação',
  'Gestão da Rede',
  'Suporte e Marketing',
] as const

export const MODULOS: Modulo[] = [
  {
    slug: 'boxes',
    nome: 'Gestão de Boxes e Ocupação',
    grupo: 'Operação da Unidade',
    icon: Boxes,
    descricao: 'Mapa da unidade, ocupação e disponibilidade de boxes.',
    recursos: [
      'Mapa visual dos boxes por corredor e tamanho',
      'Ocupação, vagos e reservados em tempo real',
      'Histórico de move-in e move-out',
      'Alertas de box parado ou contrato a vencer',
    ],
  },
  {
    slug: 'acesso',
    nome: 'Controle de Acesso Inteligente',
    grupo: 'Operação da Unidade',
    icon: ScanLine,
    descricao: 'Quem entrou na unidade, quando e por qual acesso.',
    recursos: [
      'Registro de entradas e saídas da unidade',
      'Vínculo do acesso ao contrato do box',
      'Horário de funcionamento e exceções',
      'Ocorrências de acesso fora do padrão',
    ],
  },
  {
    slug: 'cliente',
    nome: 'Portal do Cliente Final',
    grupo: 'Operação da Unidade',
    icon: Users,
    descricao: 'Área do locatário para contrato, boleto e visitas.',
    recursos: [
      'Consulta do contrato e do tamanho do box',
      '2ª via de cobrança e situação financeira',
      'Agendamento de visita e mudança',
      'Canal de recado com a unidade',
    ],
  },
  {
    slug: 'manuais',
    nome: 'Manuais e Processos',
    grupo: 'Conhecimento e Treinamento',
    icon: Library,
    descricao: 'POPs, políticas e a base de conhecimento da rede.',
    ativo: true,
    para: '/manuais',
    recursos: [],
  },
  {
    slug: 'universidade',
    nome: 'Universidade UBOX',
    grupo: 'Conhecimento e Treinamento',
    icon: GraduationCap,
    descricao: 'Trilhas, quizzes e certificados da formação.',
    ativo: true,
    para: '/trilhas',
    recursos: [],
  },
  {
    slug: 'implantacao',
    nome: 'Implantação de Franquias',
    grupo: 'Expansão e Implantação',
    icon: Building2,
    descricao: 'Jornada da aprovação do ponto até a inauguração.',
    recursos: [
      'Roadmap da implantação com datas a partir do kickoff',
      'Checklist de ponto, obra, alvarás e enxoval',
      'Pendências entre franqueado e franqueadora',
      'Critério de liberação para inaugurar',
    ],
  },
  {
    slug: 'crm',
    nome: 'CRM e Gestão Comercial',
    grupo: 'Expansão e Implantação',
    icon: Store,
    descricao: 'Funil de candidatos e de locação das unidades.',
    recursos: [
      'Leads de franquia e de box no mesmo funil',
      'Etapas da COF até o contrato',
      'Origem do contato e próxima ação',
      'Conversão por cidade e por unidade',
    ],
  },
  {
    slug: 'financeiro',
    nome: 'Financeiro e Royalties',
    grupo: 'Gestão da Rede',
    icon: Wallet,
    descricao: 'Repasse, royalties e o calendário financeiro.',
    recursos: [
      'Calendário de royalties e fundo de propaganda',
      'Conciliação de recebíveis da unidade',
      'DRE gerencial no padrão da rede',
      'Alertas de atraso no repasse',
    ],
  },
  {
    slug: 'indicadores',
    nome: 'Indicadores da Rede',
    grupo: 'Gestão da Rede',
    icon: BarChart3,
    descricao: 'Ocupação, ticket e inadimplência de cada unidade.',
    recursos: [
      'Painel de ocupação e ticket médio',
      'Comparativo entre unidades',
      'Inadimplência e conversão de visitas',
      'Metas da rede e desvio do mês',
    ],
  },
  {
    slug: 'auditoria',
    nome: 'Auditoria e Qualidade',
    grupo: 'Gestão da Rede',
    icon: ShieldCheck,
    descricao: 'Visitas de campo e plano de ação da unidade.',
    recursos: [
      'Checklist do consultor de campo',
      'Nota por bloco: operação, segurança e marca',
      'Plano de ação com prazo e responsável',
      'Histórico das visitas da unidade',
    ],
  },
  {
    slug: 'chamados',
    nome: 'Chamados e Demandas',
    grupo: 'Suporte e Marketing',
    icon: LifeBuoy,
    descricao: 'Pedidos da unidade para a franqueadora.',
    recursos: [
      'Abertura de chamado com prioridade',
      'Prazo de primeira resposta e de solução',
      'Histórico do que já foi pedido',
      'Escalonamento quando o prazo estoura',
    ],
  },
  {
    slug: 'marketing',
    nome: 'Central de Marketing',
    grupo: 'Suporte e Marketing',
    icon: Megaphone,
    descricao: 'Artes, campanhas e o calendário da rede.',
    recursos: [
      'Biblioteca de artes e mensagens aprovadas',
      'Calendário de campanhas nacionais',
      'Pedido de peça local para a agência',
      'Regras do que pode ir para as redes da unidade',
    ],
  },
  {
    slug: 'senhas',
    nome: 'Central de Acessos e Senhas',
    grupo: 'Suporte e Marketing',
    icon: KeyRound,
    descricao: 'Onde ficam os acessos oficiais da unidade.',
    recursos: [
      'Cofre dos sistemas homologados da rede',
      'Quem pode ver cada credencial',
      'Pedido de acesso novo com aprovação',
      'Troca de senha quando alguém sai da equipe',
    ],
  },
]

export function moduloPorSlug(slug: string): Modulo | undefined {
  return MODULOS.find((modulo) => modulo.slug === slug)
}
