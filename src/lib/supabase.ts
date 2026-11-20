import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { resolverSupabaseConfig } from '../supabaseConfig'

let cliente: SupabaseClient | null = null

/** Cliente único do Supabase (criado só quando o backend 'supabase' é usado). */
export function requireSupabase(): SupabaseClient {
  if (!cliente) {
    const { url, chave } = resolverSupabaseConfig()
    cliente = createClient(url, chave, {
      // PKCE: o link de redefinição volta com ?code= (o HashRouter usa o #, então não dá para receber tokens no fragmento).
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    })
  }
  return cliente
}
