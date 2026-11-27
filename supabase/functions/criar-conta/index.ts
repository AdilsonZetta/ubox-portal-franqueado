// Edge Function criar-conta: cria o login de uma pessoa nova (equipe ou responsável de unidade) e grava o perfil.
// - A service_role só existe aqui, no servidor (variável SUPABASE_SERVICE_ROLE_KEY do próprio Supabase); nunca no app.
// - Ela registra as tentativas e cria/apaga o login. O perfil é gravado COM O TOKEN DE QUEM CHAMOU: o RLS e os gatilhos decidem
//   (usuarios_admin_cria, usuarios_franqueado_cria_equipe, criar_unidade_com_responsavel).
// - Se o perfil for recusado, o login recém-criado é apagado (igual ao criarLoginEGravar do Firebase).
// Feito por Grok Bot no Cursor (Antigravity sem cota).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { cpfValido, emailCliente } from '../_shared/cpf.ts'
import { montarLinkSenha, ORIGENS, podeGerarLink, VALIDADE_LINK_SEGUNDOS } from './regras.ts'

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const ERRO_LINK = 'Não foi possível gerar o link. Tente novamente.'
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
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const senhaAleatoria = () => 'Aa1!' + Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
const lista = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length <= 40).slice(0, 40) : [])

async function gerarLink(auth: SupabaseClient['auth'], email: string, origem: string | null) {
  const inicio = Date.now()
  const resultado = await auth.admin.generateLink({ type: 'recovery', email }).catch(() => null)
  const token = resultado?.data?.properties?.hashed_token
  if (!token || resultado?.error) return null
  return {
    link: montarLinkSenha(origem, token),
    expiraEm: new Date(inicio + VALIDADE_LINK_SEGUNDOS * 1000).toISOString(),
  }
}

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

  const chamadorId = sessao.user.id
  const { data: perfil } = await comoQuemChamou.from('usuarios').select('id, papel, ativo, recusado, unidade_id, modulos_liberados').eq('id', chamadorId).maybeSingle()
  let corpo: Record<string, unknown>
  try {
    const dados: unknown = await req.json()
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error()
    corpo = dados as Record<string, unknown>
  } catch {
    return resposta(req, 400, { erro: 'Pedido inválido.' })
  }
  const acao = corpo.acao === undefined ? 'criar' : corpo.acao
  if (acao !== 'criar' && acao !== 'link' && acao !== 'criar-acesso-cliente') return resposta(req, 400, { erro: 'Pedido inválido.' })

  const origem = req.headers.get('Origin')
  const admin = createClient(url, servico, { auth: { persistSession: false, autoRefreshToken: false } })
  async function registrarTentativa() {
    const { data, error } = await admin.rpc('registrar_criacao_conta', { p_uid: chamadorId })
    return !error && data === true
  }
  const erroLimite = { erro: 'Muitas tentativas em pouco tempo. Tente de novo em alguns minutos.' }

  if (acao === 'criar-acesso-cliente') {
    const clienteId = texto(corpo.clienteId, 64)
    const semPermissao = { erro: 'O acesso do cliente está indisponível para esta unidade.' }
    if (!clienteId || !perfil?.unidade_id) return resposta(req, 403, semPermissao)
    const { data: unidade } = await comoQuemChamou.from('unidades').select('ativo').eq('id', perfil.unidade_id).maybeSingle()
    if (!podeGerarLink({ ...perfil, unidade_ativa: unidade?.ativo }, { id: '', papel: 'cliente', unidade_id: perfil.unidade_id })) {
      return resposta(req, 403, semPermissao)
    }
    if (!await registrarTentativa()) return resposta(req, 429, erroLimite)
    const preparar = (novo?: { p_uid: string; p_email: string }) => admin.rpc('preparar_acesso_cliente', {
      p_chamador: chamadorId, p_cliente: clienteId, ...novo,
    })
    const { data: cliente, error } = await preparar()
    if (error || !cliente || !cpfValido(cliente.cpf)) return resposta(req, 403, semPermissao)

    let uid = cliente.uid as string | null
    if (!uid) {
      const email = await emailCliente(cliente.cpf, cliente.unidade_id, clienteId)
      const { data, error: falha } = await admin.auth.admin.createUser({ email, password: senhaAleatoria(), email_confirm: true })
      if (falha || !data.user) return resposta(req, 409, { erro: 'Não foi possível criar o acesso. Tente novamente.' })
      const novoId = data.user.id
      const gravacao = await preparar({ p_uid: novoId, p_email: email })
      uid = gravacao.data?.uid ?? null
      if (uid !== novoId) await admin.auth.admin.deleteUser(novoId)
      if (gravacao.error || !uid) return resposta(req, 403, semPermissao)
    }
    const conta = await admin.auth.admin.getUserById(uid)
    const email = conta.data.user?.email
    const link = email ? await gerarLink(admin.auth, email, origem) : null
    return resposta(req, 200, link ? { uid, ...link } : { uid, link: null, erroLink: ERRO_LINK })
  }

  if (acao === 'link') {
    const uid = corpo.uid
    if (typeof uid !== 'string' || !UUID.test(uid)) return resposta(req, 400, { erro: 'Usuário inválido.' })
    const semPermissao = { erro: 'Sem permissão para gerar o link.' }
    if (!perfil?.ativo || perfil.recusado || !['admin', 'franqueado', 'equipe_franqueado'].includes(perfil.papel)) {
      return resposta(req, 403, semPermissao)
    }
    const { data: alvoVisivel } = await comoQuemChamou.from('usuarios').select('id, papel, unidade_id').eq('id', uid).maybeSingle()
    const { data: alvoCliente } = !alvoVisivel && perfil.papel !== 'admin'
      ? await admin.from('usuarios').select('id, papel, unidade_id, cliente_id').eq('id', uid).eq('papel', 'cliente').maybeSingle()
      : { data: null }
    const alvo = alvoVisivel ?? alvoCliente
    const { data: un } = alvo?.papel === 'cliente' && perfil.unidade_id
      ? await comoQuemChamou.from('unidades').select('ativo').eq('id', perfil.unidade_id).maybeSingle()
      : { data: null }
    if (!alvo || !podeGerarLink({ ...perfil, unidade_ativa: un?.ativo }, alvo)) return resposta(req, 403, semPermissao)
    if (!await registrarTentativa()) return resposta(req, 429, erroLimite)

    if (alvoCliente) {
      const { data } = await admin.rpc('preparar_acesso_cliente', { p_chamador: chamadorId, p_cliente: alvoCliente.cliente_id })
      if (data?.uid !== uid) return resposta(req, 403, semPermissao)
    }

    const conta = await admin.auth.admin.getUserById(uid).catch(() => null)
    const email = conta?.data?.user?.email
    if (conta?.error || !email) return resposta(req, 500, { erro: ERRO_LINK })

    const link = await gerarLink(admin.auth, email, origem)
    return link ? resposta(req, 200, link) : resposta(req, 500, { erro: ERRO_LINK })
  }

  const tipo = corpo.tipo === 'unidade' ? 'unidade' : 'equipe'
  // Pré-checagem só para não criar login à toa; quem decide de verdade é o RLS na gravação do perfil.
  const pode = perfil?.ativo === true && perfil.recusado !== true
    && (perfil.papel === 'admin' || (tipo === 'equipe' && perfil.papel === 'franqueado'))
  if (!pode) return resposta(req, 403, { erro: 'Sem permissão para criar contas.' })

  const email = texto(corpo.email, 199).toLowerCase()
  const senha = corpo.senha === undefined
    ? senhaAleatoria()
    : corpo.senha
  if (!EMAIL.test(email)) return resposta(req, 400, { erro: 'E-mail inválido.' })
  if (typeof senha !== 'string' || senha.length < 6 || senha.length > 72) return resposta(req, 400, { erro: 'A senha provisória precisa ter de 6 a 72 caracteres.' })
  const unidadeId = texto(corpo.unidadeId, 80)
  const papelCompativel = unidadeId
    ? corpo.papel === 'franqueado' || corpo.papel === 'equipe_franqueado'
    : corpo.papel === 'equipe_franqueadora'
  if (tipo === 'equipe' && !papelCompativel) {
    return resposta(req, 400, { erro: 'Função incompatível com o vínculo do usuário.' })
  }

  if (!await registrarTentativa()) return resposta(req, 429, erroLimite)

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
        p_unidade_id: unidadeId,
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
        unidade_id: unidadeId || null,
        modulos_liberados: lista(corpo.modulosLiberados),
        criado_por: chamadorId,
      })

  if (gravacao.error) {
    const exclusao = await admin.auth.admin.deleteUser(novoId).catch(() => null)
    return resposta(req, 403, {
      erro: !exclusao || exclusao.error
        ? 'Não foi possível apagar o login provisório. Use outro e-mail ou peça para remover essa conta antes de tentar de novo.'
        : 'Não foi possível concluir o cadastro. O login provisório foi apagado.',
    })
  }
  const link = await gerarLink(admin.auth, email, origem)
  return resposta(req, 200, link ? { uid: novoId, ...link } : { uid: novoId, link: null, erroLink: ERRO_LINK })
})
