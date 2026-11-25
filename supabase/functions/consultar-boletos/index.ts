import { createClient } from 'npm:@supabase/supabase-js@2'

import { ORIGENS } from '../criar-conta/regras.ts'
import { consultarBoletos, periodoDeConsulta } from './asaas.ts'

Deno.serve(async (req) => {
  const origem = req.headers.get('Origin')
  const cors = new Headers({
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  })
  if (origem && ORIGENS.includes(origem)) cors.set('Access-Control-Allow-Origin', origem)
  const responder = (status: number, dados: object) => Response.json(dados, { status, headers: cors })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return responder(405, { erro: 'Método não permitido.' })

  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return responder(401, { erro: 'Entre no portal para consultar boletos.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const banco = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: sessao, error: erroSessao } = await banco.auth.getUser(authorization.slice(7))
  if (erroSessao || !sessao.user) return responder(401, { erro: 'Sessão inválida. Entre novamente.' })

  // A busca por documento abrange a conta do Asaas inteira.
  const { data: perfil, error: erroPerfil } = await banco.from('usuarios')
    .select('papel, ativo, recusado').eq('id', sessao.user.id).maybeSingle()
  if (erroPerfil || !perfil || perfil.papel !== 'admin' || perfil.ativo !== true || perfil.recusado === true) {
    return responder(403, { erro: 'Somente administradores ativos podem consultar boletos.' })
  }

  const corpo: unknown = await req.json().catch(() => null)
  const consulta = corpo && typeof corpo === 'object' && 'cpfCnpj' in corpo && 'mes' in corpo
    ? periodoDeConsulta(corpo.cpfCnpj, corpo.mes)
    : null
  if (!consulta) return responder(400, { erro: 'Confira o CPF ou CNPJ e o mês de vencimento.' })

  const chave = Deno.env.get('ASAAS_API_KEY')
  const ambiente = Deno.env.get('ASAAS_AMBIENTE')
  if (!chave || (ambiente !== 'sandbox' && ambiente !== 'producao')) {
    return responder(503, { erro: 'A consulta de boletos ainda precisa ser configurada pela franqueadora.' })
  }

  try {
    const boletos = await consultarBoletos({ chave, ambiente }, consulta)
    return responder(200, { boletos })
  } catch {
    return responder(502, { erro: 'Não foi possível consultar os boletos no Asaas. Tente novamente.' })
  }
})
