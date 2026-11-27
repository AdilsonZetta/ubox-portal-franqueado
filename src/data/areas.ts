export const AREAS = {
  marketing: 'Marketing',
  operacao: 'Operação',
  financeiro: 'Financeiro',
  juridico: 'Jurídico',
  sistemas: 'Sistemas',
  implantacao: 'Implantação',
  expansao: 'Expansão',
  treinamento: 'Treinamento',
  comercial: 'Comercial',
  outros: 'Outros',
} as const

export type Area = keyof typeof AREAS
