/**
 * Qual backend o app usa. Padrão: Firebase (produção) até o corte final para o Supabase.
 * Ver MIGRACAO_SUPABASE.md. Feito por Grok Bot no Cursor (Antigravity sem cota).
 */
export type Backend = 'firebase' | 'supabase'

export function escolherBackend(valor: string | undefined): Backend {
  return valor?.trim().toLowerCase() === 'supabase' ? 'supabase' : 'firebase'
}

export const BACKEND: Backend = escolherBackend(import.meta.env.VITE_BACKEND)
