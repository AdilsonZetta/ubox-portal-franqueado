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
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'desconhecido'
    const limite = { p_cpf: credenciais.cpf, p_ip: ip }
    const { data: permitido } = await admin.rpc('login_cliente_permitido', limite)
    if (permitido !== true) return responder(429, invalido)
    const falhar = async () => {
      await admin.rpc('login_cliente_falha', limite)
      return responder(401, invalido)
    }

    const { data: contas, error } = await admin.rpc('contas_login_cliente', {
      p_cpf: credenciais.cpf,
      p_unidade: credenciais.unidadeId ?? null,
    })
    if (error || !contas?.length) return await falhar()

    // A senha é conferida antes de revelar qualquer unidade ligada ao CPF.
    type Conta = { uid: string; email: string; unidade_id: string; unidade_nome: string }
    const validas: { conta: Conta; sessao: { access_token: string; refresh_token: string; expires_in: number } }[] = []
    for (const conta of (contas as Conta[]).slice(0, 5)) {
      const sb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, opcoes)
      const { data, error: falha } = await sb.auth.signInWithPassword({ email: conta.email, password: credenciais.senha })
      if (!falha && data.session && data.user?.id === conta.uid) validas.push({ conta, sessao: data.session })
    }
    if (!validas.length) return await falhar()
    if (!credenciais.unidadeId && validas.length > 1) {
      return responder(409, {
        precisaUnidade: true,
        unidades: validas.map(({ conta }) => ({ id: conta.unidade_id, nome: conta.unidade_nome })),
      })
    }

    const { access_token, refresh_token, expires_in } = validas[0].sessao
    return responder(200, { access_token, refresh_token, expires_in })
  } catch {
    return responder(401, invalido)
  }
})
