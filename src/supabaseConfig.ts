/**
 * Configuração pública do Supabase (projeto ubox-portal-franqueado, sa-east-1).
 * Só URL e chave publicável: é seguro ir para o navegador, como a apiKey do Firebase.
 * A chave service_role NUNCA entra no app nem no repositório.
 */
const URL_PADRAO = 'https://zmreflstgxgofvuhzqau.supabase.co'
const CHAVE_PUBLICAVEL_PADRAO = 'sb_publishable_9vvq7zdwTxQp5pvd_H8hFQ_jj5aWEFG'

export interface SupabaseConfig {
  url: string
  chave: string
}

export function resolverSupabaseConfig(env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string } = import.meta.env): SupabaseConfig {
  const url = env.VITE_SUPABASE_URL?.trim() || URL_PADRAO
  const chave = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || CHAVE_PUBLICAVEL_PADRAO
  if (/service_role|sb_secret_/i.test(chave) || papelDoJwt(chave) === 'service_role') {
    throw new Error('Chave do Supabase inválida para o navegador: use a chave publicável, nunca a service_role.')
  }
  return { url, chave }
}

function papelDoJwt(chave: string): string | null {
  const partes = chave.split('.')
  if (partes.length !== 3) return null
  try {
    const json = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.role === 'string' ? json.role : null
  } catch {
    return null
  }
}
