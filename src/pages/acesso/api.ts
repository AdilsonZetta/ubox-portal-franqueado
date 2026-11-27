import { requireSupabase } from '../../lib/supabase'

export async function chamarAcesso<T>(
  funcao: 'acesso-inteligente' | 'asaas-unidade',
  acao: string, dados: Record<string, unknown>, signal?: AbortSignal,
): Promise<T> {
  const { data, error } = await requireSupabase().functions.invoke<T>(funcao, {
    body: { ...dados, acao }, signal,
  })
  if (error || data === null) {
    const resposta: unknown = error?.context
    if (resposta instanceof Response) {
      const falha = await resposta.json().catch(() => null)
      if (typeof falha?.erro === 'string') throw new Error(falha.erro)
    }
    throw new Error('Não foi possível concluir a operação. Tente novamente.')
  }
  return data
}

export function mensagemAcesso(erro: unknown) {
  return erro instanceof Error ? erro.message : 'Não foi possível concluir a operação.'
}
