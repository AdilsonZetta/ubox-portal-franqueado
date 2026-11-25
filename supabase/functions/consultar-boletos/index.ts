import { createClient } from 'npm:@supabase/supabase-js@2'

import { ORIGENS } from '../criar-conta/regras.ts'
import { consultarBoletos, periodoDeConsulta } from './asaas.ts'
import { lerConfiguracao, validarNovaConfiguracao } from './configuracao.ts'

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
  if (!corpo || typeof corpo !== 'object') return responder(400, { erro: 'Pedido inválido.' })

  // A credencial do Vault só pode ser lida ou gravada pelo servidor após a verificação do administrador.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const acao = 'acao' in corpo ? corpo.acao : 'consultar'
  if (acao === 'salvar-configuracao') {
    const config = validarNovaConfiguracao(corpo)
    if (!config) return responder(400, { erro: 'Confira se a chave corresponde ao ambiente escolhido.' })
    const { error } = await admin.rpc('ubox_asaas_salvar_configuracao', {
      p_ambiente: config.ambiente, p_chave: config.chave,
    })
    if (error) return responder(500, { erro: 'Não foi possível salvar a configuração.' })
    return responder(200, { ambiente: config.ambiente })
  }

  if (acao !== 'consultar' && acao !== 'ler-configuracao') return responder(400, { erro: 'Pedido inválido.' })
  const { data, error } = await admin.rpc('ubox_asaas_ler_configuracao')
  if (error) return responder(503, { erro: 'Não foi possível carregar a configuração do Asaas.' })

  const config = lerConfiguracao(data) ?? lerConfiguracao({
    chave: Deno.env.get('ASAAS_API_KEY'),
    ambiente: Deno.env.get('ASAAS_AMBIENTE'),
  })
  if (acao === 'ler-configuracao') return responder(200, { ambiente: config?.ambiente ?? null })
  const consulta = 'cpfCnpj' in corpo && 'mes' in corpo ? periodoDeConsulta(corpo.cpfCnpj, corpo.mes) : null
  if (!consulta) return responder(400, { erro: 'Confira o CPF ou CNPJ e o mês de vencimento.' })
  if (!config) return responder(503, { erro: 'Preencha a configuração do Asaas no módulo.' })

  try {
    const boletos = await consultarBoletos(config, consulta)
    return responder(200, { boletos })
  } catch {
    return responder(502, { erro: 'Não foi possível consultar os boletos no Asaas. Tente novamente.' })
  }
})
