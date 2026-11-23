import type { Unidade } from '../types'

export const UFS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export function ufValida(uf: string): boolean {
  return UFS_BRASIL.some((sigla) => sigla === uf)
}

export function formatarCnpj(valor: string): string {
  return valor.replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2')
    .replace(/(\/\d{4})(\d)/, '$1-$2')
}

export function cnpjValido(valor: string): boolean {
  if (!valor) return true
  if (!/^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/.test(valor)) return false
  const cnpj = valor.replace(/\D/g, '')
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  function digito(tamanho: number) {
    const soma = Array.from(cnpj.slice(0, tamanho), Number)
      .reduce((total, numero, i) => total + numero * ((tamanho - i - 1) % 8 + 2), 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13])
}

export type FiltroStatusUnidade = 'ativas' | 'inativas' | 'todas'

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function filtrarUnidades(unidades: Unidade[], busca: string, status: FiltroStatusUnidade): Unidade[] {
  const termo = normalizar(busca.trim())
  return unidades.filter((unidade) =>
    (status === 'todas' || unidade.ativo === (status === 'ativas'))
    && (normalizar(unidade.nome).includes(termo) || normalizar(unidade.cidade).includes(termo)),
  )
}
