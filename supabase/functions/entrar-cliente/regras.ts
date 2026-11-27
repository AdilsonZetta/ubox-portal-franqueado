import { cpfValido, normalizarCpf } from '../_shared/cpf.ts'

export const ERRO_LOGIN = 'CPF ou senha inválidos.'

export function lerCredenciais(valor: unknown) {
  if (!valor || typeof valor !== 'object') return null
  const { cpf, senha, unidade_id } = valor as Record<string, unknown>
  if (typeof cpf !== 'string' || cpf.length > 20 || !cpfValido(cpf)
      || typeof senha !== 'string' || !senha.length || senha.length > 256
      || (unidade_id !== undefined && (typeof unidade_id !== 'string' || !unidade_id.length || unidade_id.length > 80))) return null
  return { cpf: normalizarCpf(cpf), senha, unidadeId: unidade_id as string | undefined }
}
