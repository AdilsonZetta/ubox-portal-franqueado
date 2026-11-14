export interface CategoriaBase {
  id: string
  nome: string
  ordem: number
  descricao: string
}

/** Ids já criados no Firestore do projeto ubox-portal-franqueado. */
export const CATEGORIAS_BASE: CategoriaBase[] = [
  {
    id: 'institucional',
    nome: '01 Institucional e Boas-vindas',
    ordem: 1,
    descricao: 'História da Ubox, boas-vindas e combinados da rede.',
  },
  {
    id: 'implantacao',
    nome: '02 Implantação',
    ordem: 2,
    descricao: 'Abertura da unidade, obra, fornecedores e pré-operação.',
  },
  {
    id: 'operacao',
    nome: '03 Operação',
    ordem: 3,
    descricao: 'POPs do dia a dia: abertura, fechamento, boxes e atendimento.',
  },
  {
    id: 'equipe',
    nome: '04 Equipe',
    ordem: 4,
    descricao: 'Papéis, escala, contratação e rotina da equipe de loja.',
  },
  {
    id: 'marketing',
    nome: '05 Marketing',
    ordem: 5,
    descricao: 'Marca, campanhas, redes e materiais de venda.',
  },
  {
    id: 'financeiro',
    nome: '06 Financeiro',
    ordem: 6,
    descricao: 'Repasse, taxas, fluxo de caixa e obrigações.',
  },
  {
    id: 'treinamento',
    nome: '07 Treinamento',
    ordem: 7,
    descricao: 'Trilhas, integração e capacitação do time.',
  },
  {
    id: 'suporte',
    nome: '08 Suporte e Consultoria de Campo',
    ordem: 8,
    descricao: 'Visitas, consultoria da franqueadora e canais de ajuda.',
  },
  {
    id: 'expansao-juridico',
    nome: '09 Expansão e Jurídico',
    ordem: 9,
    descricao: 'Contratos, expansão e cuidados jurídicos.',
  },
]

export const IDS_CATEGORIAS = CATEGORIAS_BASE.map((categoria) => categoria.id)
