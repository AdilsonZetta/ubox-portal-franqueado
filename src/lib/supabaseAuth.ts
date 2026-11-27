import { FunctionsHttpError } from '@supabase/supabase-js'
import { cpfValido, normalizarCpf } from '../../supabase/functions/_shared/cpf'
import type { Session } from '@supabase/supabase-js'
import { precisaDaUnidade, statusDoPerfil, type StatusPerfil } from './authStatus'
import { requireSupabase } from './supabase'
import type { Papel, Usuario } from '../types'

/**
 * Autenticação e perfil pelo Supabase (fase 1 da migração). As tabelas são public.usuarios e public.unidades;
 * o RLS repete as regras do Firestore. Feito por Grok Bot no Cursor (Antigravity sem cota).
 */
const PAPEIS: Papel[] = ['admin', 'franqueado', 'equipe_franqueadora', 'equipe_franqueado', 'cliente']

export interface LinhaUsuario {
  id: string
  email: string
  nome: string
  papel: string
  cliente_id?: string | null
  ativo: boolean
  recusado: boolean
  area?: Usuario['area']
  unidade: string | null
  cidade: string | null
  unidade_id: string | null
  modulos_liberados: string[] | null
  criado_por: string | null
  criado_em: string | null
  atualizado_em: string | null
}

export function mapUsuarioSupabase(l: LinhaUsuario | null | undefined): Usuario | null {
  if (!l || !PAPEIS.includes(l.papel as Papel) || typeof l.email !== 'string' || typeof l.nome !== 'string') return null
  return {
    uid: l.id,
    email: l.email,
    nome: l.nome,
    papel: l.papel as Papel,
    clienteId: l.cliente_id,
    ativo: l.ativo === true,
    recusado: l.recusado === true,
    area: l.area ?? null,
    unidade: l.unidade ?? '',
    cidade: l.cidade ?? '',
    unidadeId: l.unidade_id || null,
    modulosLiberados: Array.isArray(l.modulos_liberados) ? l.modulos_liberados : undefined,
    criadoPor: l.criado_por ?? undefined,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  }
}

export interface EstadoSupabase {
  status: StatusPerfil
  user: Usuario | null
  nomeSugerido: string
}

export async function carregarEstado(sessao: Session): Promise<EstadoSupabase> {
  const sb = requireSupabase()
  const nomeSugerido = typeof sessao.user.user_metadata?.nome === 'string' ? sessao.user.user_metadata.nome : ''
  const { data, error } = await sb.from('usuarios').select('*').eq('id', sessao.user.id).maybeSingle()
  if (error) throw new Error(error.message)
  const perfil = mapUsuarioSupabase(data as LinhaUsuario | null)
  let unidadeAtiva: boolean | null = null
  if (perfil && precisaDaUnidade(perfil)) {
    const { data: un } = await sb.from('unidades').select('ativo').eq('id', perfil.unidadeId as string).maybeSingle()
    unidadeAtiva = un?.ativo === true
  }
  if (perfil?.papel === 'cliente') {
    const { data: cliente, error: falha } = await sb.from('clientes').select('id').eq('id', perfil.clienteId ?? '').maybeSingle()
    if (falha) throw new Error('Não foi possível verificar o contrato. Entre novamente.')
    return { status: cliente ? 'ready' : 'pending', user: perfil, nomeSugerido }
  }
  return { status: statusDoPerfil(perfil, unidadeAtiva), user: perfil, nomeSugerido }
}

const erroSb = (e: { message: string } | null) => {
  if (e) throw new Error(e.message)
}

export async function entrarSupabase(email: string, senha: string) {
  if (email.trim().toLowerCase().endsWith('@clientes.ubox.local')) throw new Error('Use a opção Sou cliente para entrar com seu CPF.')
  const { error } = await requireSupabase().auth.signInWithPassword({ email: email.trim(), password: senha })
  erroSb(error)
}

/** Igual ao cadastro do Firebase: cria o login e o perfil de franqueado inativo, sem módulos. */
export async function gravarPerfilProprio(dados: { nome: string; unidade: string; cidade: string }) {
  const sb = requireSupabase()
  const { data } = await sb.auth.getUser()
  const conta = data.user
  if (!conta?.email) throw new Error('Entre novamente para concluir o cadastro.')
  const { error } = await sb.from('usuarios').insert({
    id: conta.id,
    email: conta.email,
    nome: dados.nome.trim(),
    papel: 'franqueado',
    ativo: false,
    recusado: false,
    unidade: dados.unidade.trim(),
    cidade: dados.cidade.trim(),
    modulos_liberados: [],
  })
  erroSb(error)
}

export async function cadastrarSupabase(dados: { nome: string; email: string; senha: string; unidade: string; cidade: string }) {
  if (dados.email.trim().toLowerCase().endsWith('@clientes.ubox.local')) throw new Error('Informe seu e-mail de trabalho.')
  const sb = requireSupabase()
  const { data, error } = await sb.auth.signUp({ email: dados.email.trim(), password: dados.senha, options: { data: { nome: dados.nome.trim() } } })
  erroSb(error)
  // Com confirmação de e-mail ligada não há sessão ainda: o perfil é gravado no primeiro login (tela "completar").
  if (data.session) await gravarPerfilProprio(dados)
}

export const PEDIR_LINK_CLIENTE = 'Peça um novo link de acesso na sua unidade UBOX.'

export interface UnidadeLoginCliente { id: string; nome: string }

export async function entrarClienteSupabase(cpf: string, senha: string, unidadeId?: string): Promise<UnidadeLoginCliente[] | null> {
  const invalido = new Error('CPF ou senha inválidos.')
  if (!cpfValido(cpf)) throw invalido
  const sb = requireSupabase()
  const { data, error } = await sb.functions.invoke('entrar-cliente', {
    body: { cpf: normalizarCpf(cpf), senha, unidade_id: unidadeId },
  })
  if (error instanceof FunctionsHttpError && error.context.status === 409) {
    const resposta = await error.context.json().catch(() => null)
    if (resposta?.precisaUnidade === true && Array.isArray(resposta.unidades) && resposta.unidades.length > 1
      && resposta.unidades.every((u: UnidadeLoginCliente) => typeof u?.id === 'string' && typeof u.nome === 'string')) return resposta.unidades
  }
  if (error || typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string') throw invalido
  const sessao = await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
  if (sessao.error) throw invalido
  return null
}

export async function recuperarSupabase(email: string) {
  if (email.trim().toLowerCase().endsWith('@clientes.ubox.local')) throw new Error(PEDIR_LINK_CLIENTE)
  // Volta para a raiz do app; o evento PASSWORD_RECOVERY leva para a tela de nova senha.
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo })
  erroSb(error)
}

export async function sairSupabase() {
  const { error } = await requireSupabase().auth.signOut()
  erroSb(error)
}

export async function definirNovaSenha(senha: string) {
  const { error } = await requireSupabase().auth.updateUser({ password: senha })
  erroSb(error)
}
