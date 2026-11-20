// Edge Function criar-conta: cria o login de uma pessoa nova (equipe ou responsável de unidade) e grava o perfil.
// - A service_role só existe aqui, no servidor (variável SUPABASE_SERVICE_ROLE_KEY do próprio Supabase); nunca no app.
// - Ela registra as tentativas e cria/apaga o login. O perfil é gravado COM O TOKEN DE QUEM CHAMOU: o RLS e os gatilhos decidem
//   (usuarios_admin_cria, usuarios_franqueado_cria_equipe, criar_unidade_com_responsavel).
// - Se o perfil for recusado, o login recém-criado é apagado (igual ao criarLoginEGravar do Firebase).
// Feito por Grok Bot no Cursor (Antigravity sem cota).
import { createClient } from 'npm:@supabase/supabase-js@2'

const ORIGENS = ['https://adilsonzetta.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']
const PAPEIS_CRIAVEIS = ['franqueado', 'equipe_franqueadora', 'equipe_franqueado']
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

function cors(req: Request): Record<string, string> {
  const origem = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function resposta(req: Request, status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } })
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const lista = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length <= 40).slice(0, 40) : [])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return resposta(req, 405, { erro: 'Método não permitido.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return resposta(req, 401, { erro: 'Entre no portal para criar contas.' })

  // Cliente com o token de quem chamou: tudo o que ele grava passa pelo RLS.
  const comoQuemChamou = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: sessao, error: erroSessao } = await comoQuemChamou.auth.getUser(authorization.slice(7))
  if (erroSessao || !sessao.user) return resposta(req, 401, { erro: 'Sessão inválida. Entre de novo.' })

  const { data: perfil } = await comoQuemChamou.from('usuarios').select('papel, ativo, recusado').eq('id', sessao.user.id).maybeSingle()
  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return resposta(req, 400, { erro: 'Pedido inválido.' })
  }
  const tipo = corpo.tipo === 'unidade' ? 'unidade' : 'equipe'
  // Pré-checagem só para não criar login à toa; quem decide de verdade é o RLS na gravação do perfil.
  const pode = perfil?.ativo === true && perfil.recusado !== true
    && (perfil.papel === 'admin' || (tipo === 'equipe' && perfil.papel === 'franqueado'))
  if (!pode) return resposta(req, 403, { erro: 'Sem permissão para criar contas.' })

  const email = texto(corpo.email, 199).toLowerCase()
  const senha = typeof corpo.senha === 'string' ? corpo.senha : ''
  if (!EMAIL.test(email)) return resposta(req, 400, { erro: 'E-mail inválido.' })
  if (senha.length < 6 || senha.length > 72) return resposta(req, 400, { erro: 'A senha provisória precisa ter de 6 a 72 caracteres.' })
  if (tipo === 'equipe' && !PAPEIS_CRIAVEIS.includes(String(corpo.papel))) return resposta(req, 400, { erro: 'Papel inválido.' })

  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: tentativaPermitida, error: erroLimite } = await admin.rpc('registrar_criacao_conta', { p_uid: sessao.user.id })
  if (erroLimite || tentativaPermitida !== true) {
    return resposta(req, 429, { erro: 'Muitas contas criadas em pouco tempo. Tente de novo em alguns minutos.' })
  }

  const nome = texto(tipo === 'unidade' ? corpo.responsavel : corpo.nome, 120)
  const criacao = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  }).catch(() => null)
  if (!criacao || criacao.error || !criacao.data?.user) {
    return resposta(req, 400, { erro: 'Não foi possível criar o login. Confira os dados ou fale com a franqueadora.' })
  }
  const novoId = criacao.data.user.id

  const gravacao = tipo === 'unidade'
    ? await comoQuemChamou.rpc('criar_unidade_com_responsavel', {
        p_unidade_id: texto(corpo.unidadeId, 80),
        p_nome: texto(corpo.nome, 120),
        p_cidade: texto(corpo.cidade, 120),
        p_responsavel: nome,
        p_email: email,
        p_modulos: lista(corpo.modulosLiberados),
        p_uid: novoId,
      })
    : await comoQuemChamou.from('usuarios').insert({
        id: novoId,
        email,
        nome,
        papel: corpo.papel,
        ativo: corpo.ativo === true,
        recusado: false,
        unidade: texto(corpo.unidade, 120),
        cidade: texto(corpo.cidade, 120),
        unidade_id: texto(corpo.unidadeId, 80) || null,
        modulos_liberados: lista(corpo.modulosLiberados),
        criado_por: sessao.user.id,
      })

  if (gravacao.error) {
    const exclusao = await admin.auth.admin.deleteUser(novoId).catch(() => null)
    return resposta(req, 403, {
      erro: !exclusao || exclusao.error
        ? 'Não foi possível apagar o login provisório. Use outro e-mail ou peça para remover essa conta antes de tentar de novo.'
        : 'Não foi possível concluir o cadastro. O login provisório foi apagado.',
    })
  }
  return resposta(req, 200, { uid: novoId })
})
