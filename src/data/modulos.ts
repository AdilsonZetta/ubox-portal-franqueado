import type { LucideIcon } from 'lucide-react'
import {
  ClipboardList,
  Cloud,
  GraduationCap,
  KeyRound,
  Library,
  LifeBuoy,
  Megaphone,
  Package,
  ScanLine,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  UsersRound,
} from 'lucide-react'

export type AudienciaModulo = 'franqueado' | 'franqueadora'

export interface Modulo {
  slug: string
  nome: string
  descricao: string
  grupo: string
  audiencia: AudienciaModulo
  icon: LucideIcon
  ativo?: boolean
  para?: string
  recursos: string[]
}

export const GRUPOS = ['Módulos do franqueado', 'Módulos da franqueadora'] as const

export const MODULOS: Modulo[] = [
  {
    slug: 'senhas',
    nome: 'Central de Acessos e Senhas',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: KeyRound,
    descricao: 'Acessos oficiais da unidade, com pedido e troca de senha.',
    ativo: true,
    para: '/senhas',
    recursos: ['Cofre dos sistemas', 'Quem pode ver', 'Pedido de acesso', 'Troca de senha'],
  },
  {
    slug: 'manuais',
    nome: 'Manuais e Processos',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: Library,
    descricao: 'POPs, políticas e a base de conhecimento da rede.',
    ativo: true,
    para: '/manuais',
    recursos: [],
  },
  {
    slug: 'chamados',
    nome: 'Chamados e Demandas',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: LifeBuoy,
    descricao: 'Pedidos da unidade para a franqueadora, com prazo e histórico.',
    ativo: true,
    para: '/chamados',
    recursos: [],
  },
  {
    slug: 'marketing',
    nome: 'Central de Marketing',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: Megaphone,
    descricao: 'Artes, logos e templates aprovados, o calendário de campanhas e os pedidos de peça.',
    recursos: ['Artes aprovadas', 'Calendário', 'Pedido de peça', 'Regras de publicação'],
    ativo: true,
    para: '/marketing',
  },
  {
    slug: 'universidade',
    nome: 'Universidade UBOX',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: GraduationCap,
    descricao: 'Cursos, provas e certificados da formação.',
    ativo: true,
    para: '/universidade',
    recursos: [],
  },
  {
    slug: 'checklist',
    nome: 'Checklist Operacional',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: ClipboardList,
    descricao: 'Abertura, fechamento, limpeza e vistorias com score, evidências e pendências.',
    recursos: ['Abertura', 'Fechamento', 'Conferência do corredor', 'Pendências do dia'],
    ativo: true,
    para: '/checklist',
  },
  {
    slug: 'estoque',
    nome: 'Controle de Estoque',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: Package,
    descricao: 'Insumos, cadeados, caixas, embalagens, limpeza e uniformes: saldo, contagem e pedidos de reposição.',
    recursos: ['Saldo', 'Entrada e saída', 'Pedido de reposição', 'Itens críticos'],
    ativo: true,
    para: '/estoque',
  },
  {
    slug: 'crm',
    nome: 'CRM e Gestão Comercial',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: Store,
    descricao: 'Funil de locação de boxes: leads, follow-ups, propostas e conversão da unidade.',
    recursos: ['Leads', 'Etapas', 'Próxima ação', 'Conversão'],
    ativo: true,
    para: '/crm',
  },
  {
    slug: 'acesso',
    nome: 'Controle de Acesso Inteligente',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: ScanLine,
    descricao: 'Gerencie cobranças Asaas, tolerância e liberações manuais por unidade. A conexão Hikvision está em preparação.',
    ativo: true,
    para: '/modulos/acesso',
    recursos: ['Conta Asaas da unidade', 'Tolerância de vencimento', 'Liberação manual', 'Configuração da API Hikvision'],
  },
  {
    slug: 'cliente',
    nome: 'Painel do Cliente',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: Users,
    descricao: 'Clientes da unidade com contrato, cobranças, visitas e recados, e um link secreto para o locatário acompanhar sem senha.',
    recursos: ['Contrato', 'Cobrança', 'Visitas', 'Recados'],
    ativo: true,
    para: '/clientes',
  },
  {
    slug: 'nuvem',
    nome: 'Arquivos da unidade',
    grupo: 'Módulos do franqueado',
    audiencia: 'franqueado',
    icon: Cloud,
    descricao: 'Arquivos privados da sua unidade e arquivos que a franqueadora compartilha com ela. A área privada é só da unidade: a franqueadora não tem acesso.',
    recursos: ['Área privada da unidade', 'Links da rede', 'Pastas e etiquetas', 'Adicionados recentemente'],
    ativo: true,
    para: '/nuvem',
  },
  {
    slug: 'gestao-franqueadora',
    nome: 'Unidades e usuários',
    grupo: 'Módulos da franqueadora',
    audiencia: 'franqueadora',
    icon: UserCog,
    descricao: 'Crie as unidades franqueadas e os usuários de cada uma.',
    ativo: true,
    para: '/franqueadora',
    recursos: [],
  },
  {
    slug: 'gestao-usuarios',
    nome: 'Usuários da franqueadora',
    grupo: 'Módulos da franqueadora',
    audiencia: 'franqueadora',
    icon: UsersRound,
    descricao: 'Equipe da franqueadora e o que cada pessoa acessa.',
    ativo: true,
    para: '/gestao-usuarios',
    recursos: [],
  },
  {
    slug: 'acompanhamento',
    nome: 'Acompanhamento do Franqueado',
    grupo: 'Módulos da franqueadora',
    audiencia: 'franqueadora',
    icon: Users,
    descricao: 'Saúde de cada unidade, visitas, reuniões e os combinados com a franqueadora.',
    recursos: ['Visão da rede', 'Painel da unidade', 'Visitas e reuniões', 'Próximos passos'],
    ativo: true,
    para: '/acompanhamento',
  },
  {
    slug: 'auditoria',
    nome: 'Auditoria e Qualidade',
    grupo: 'Módulos da franqueadora',
    audiencia: 'franqueadora',
    icon: ShieldCheck,
    descricao: 'Auditorias das unidades com nota mínima, assinaturas e plano de ação.',
    recursos: ['Auditorias', 'Modelos', 'Assinatura e ciência', 'Plano de ação'],
    ativo: true,
    para: '/auditoria',
  },
  {
    slug: 'nuvem-rede',
    nome: 'Arquivos da rede',
    grupo: 'Módulos da franqueadora',
    audiencia: 'franqueadora',
    icon: Cloud,
    descricao: 'Arquivos que a franqueadora publica para a rede toda, para unidades escolhidas ou só para a equipe da franqueadora.',
    recursos: ['Rede toda', 'Unidades escolhidas', 'Pasta da franqueadora', 'Pastas e etiquetas'],
    ativo: true,
    para: '/nuvem/rede',
  },
]

export const SLUGS_FRANQUEADO = MODULOS.filter((modulo) => modulo.audiencia === 'franqueado').map((modulo) => modulo.slug)

export function moduloPorSlug(slug: string): Modulo | undefined {
  return MODULOS.find((modulo) => modulo.slug === slug)
}

export function subconjunto(pedido: string[], teto: string[]): boolean {
  return pedido.every((slug) => teto.includes(slug))
}
