import { createClient } from 'npm:@supabase/supabase-js@2'
import { ORIGENS } from '../criar-conta/regras.ts'
import { ERRO_LOGIN, lerCredenciais } from './regras.ts'

Deno.serve(async (req) => {
  const origem = req.headers.get('Origin') ?? ''
  const headers = {
    'Access-Control-Allow-Origin': ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  const responder = (status: number, body: unknown) => Response.json(body, { status, headers })
  const invalido = { erro: ERRO_LOGIN }
  if (req.method !== 'POST') return responder(405, invalido)

  try {
    const credenciais = lerCredenciais(await req.json().catch(() => null))
    if (!credenciais) return responder(400, invalido)

    const url = Deno.env.get('SUPABASE_URL')!
    const opcoes = { auth: { persistSession: false, autoRefreshToken: false } }
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, opcoes)
    const { data: contas, error } = await admin.rpc('contas_login_cliente', {
      p_cpf: credenciais.cpf,
      p_unidade: credenciais.unidadeId ?? null,
    })
    if (error || !contas?.length) return responder(401, invalido)
    if (!credenciais.unidadeId && contas.length > 1) {
      return responder(409, {
        precisaUnidade: true,
        unidades: contas.map((conta: { unidade_id: string; unidade_nome: string }) => ({
          id: conta.unidade_id, nome: conta.unidade_nome,
        })),
      })
    }

    const conta = contas[0]
    const sb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, opcoes)
    const { data, error: falha } = await sb.auth.signInWithPassword({ email: conta.email, password: credenciais.senha })
    if (falha || !data.session || data.user?.id !== conta.uid) return responder(401, invalido)
    const { access_token, refresh_token, expires_in } = data.session
    return responder(200, { access_token, refresh_token, expires_in })
  } catch {
    return responder(401, invalido)
  }
})
