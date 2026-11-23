import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Unidade, Usuario } from '../types'
import { requireSupabase } from './supabase'
import { mapUsuarioSupabase, type LinhaUsuario } from './supabaseAuth'

/**
 * Gestão de acessos pelo Supabase (fase 2 da migração). O RLS e os gatilhos repetem as regras do Firestore;
 * a criação de logins passa pela Edge Function criar-conta (service_role só no servidor).
 * Feito por Grok Bot no Cursor (Antigravity sem cota).
 */
export interface LinhaUnidade {
  id: string
  nome: string
  cidade: string | null
  uf?: string | null
  cnpj?: string | null
  responsavel: string
  email: string
  uid: string | null
  modulos_liberados: string[] | null
  ativo: boolean
  criado_por: string | null
  criado_em: string | null
  atualizado_em: string | null
}

export function mapUnidadeSupabase(l: LinhaUnidade): Unidade {
  return {
    id: l.id,
    nome: l.nome ?? '',
    cidade: l.cidade ?? '',
    uf: l.uf ?? '',
    cnpj: l.cnpj ?? '',
    responsavel: l.responsavel ?? '',
    email: l.email ?? '',
    uid: l.uid || null,
    modulosLiberados: Array.isArray(l.modulos_liberados) ? l.modulos_liberados : [],
    ativo: l.ativo === true,
    criadoPor: l.criado_por ?? undefined,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  }
}

type PatchUsuario = Partial<Pick<Usuario, 'nome' | 'papel' | 'ativo' | 'recusado' | 'unidade' | 'cidade' | 'modulosLiberados'>>

/** Converte o patch do app (camelCase) para as colunas; campos fora da lista são ignorados. */
export function patchUsuarioParaLinha(patch: PatchUsuario): Record<string, unknown> {
  const linha: Record<string, unknown> = {}
  if (patch.nome !== undefined) linha.nome = patch.nome.trim()
  if (patch.papel !== undefined) linha.papel = patch.papel
  if (patch.ativo !== undefined) linha.ativo = patch.ativo
  if (patch.recusado !== undefined) linha.recusado = patch.recusado
  if (patch.unidade !== undefined) linha.unidade = patch.unidade
  if (patch.cidade !== undefined) linha.cidade = patch.cidade
  if (patch.modulosLiberados !== undefined) linha.modulos_liberados = patch.modulosLiberados
  return linha
}

const falhou = (erro: { message: string } | null) => {
  if (erro) throw new Error(erro.message)
}

function porNome<T extends { nome: string }>(a: T, b: T) {
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

export async function listarUsuariosSb(): Promise<Usuario[]> {
  const { data, error } = await requireSupabase().from('usuarios').select('*')
  falhou(error)
  return ((data ?? []) as LinhaUsuario[]).map(mapUsuarioSupabase).filter((u): u is Usuario => u !== null)
}

export async function listarUnidadesSb(): Promise<Unidade[]> {
  const { data, error } = await requireSupabase().from('unidades').select('*')
  falhou(error)
  return ((data ?? []) as LinhaUnidade[]).map(mapUnidadeSupabase).sort(porNome)
}

export async function buscarUnidadeSb(id: string): Promise<Unidade | null> {
  const { data, error } = await requireSupabase().from('unidades').select('*').eq('id', id).maybeSingle()
  falhou(error)
  return data ? mapUnidadeSupabase(data as LinhaUnidade) : null
}

export async function listarUsuariosDaUnidadeSb(unidadeId: string): Promise<Usuario[]> {
  const { data, error } = await requireSupabase().from('usuarios').select('*').eq('unidade_id', unidadeId)
    .in('papel', ['franqueado', 'equipe_franqueado'])
  falhou(error)
  return ((data ?? []) as LinhaUsuario[]).map(mapUsuarioSupabase).filter((u): u is Usuario => u !== null).sort(porNome)
}

export type DadosUnidade = Pick<Unidade, 'nome' | 'cidade' | 'uf' | 'cnpj' | 'modulosLiberados' | 'ativo'>

export async function salvarUnidadeSb(id: string | null, dados: DadosUnidade): Promise<string> {
  const { data, error } = await requireSupabase().rpc('salvar_unidade', {
    p_id: id,
    p_nome: dados.nome,
    p_cidade: dados.cidade,
    p_uf: dados.uf ?? '',
    p_cnpj: dados.cnpj ?? '',
    p_modulos: dados.modulosLiberados,
    p_ativo: dados.ativo,
  })
  falhou(error)
  if (typeof data !== 'string') throw new Error('Não foi possível salvar a unidade.')
  return data
}

export async function definirResponsavelUnidadeSb(unidadeId: string, uid: string): Promise<void> {
  const { error } = await requireSupabase().rpc('definir_responsavel_unidade', { p_unidade_id: unidadeId, p_uid: uid })
  falhou(error)
}

export async function listarEquipeDaUnidadeSb(unidadeId: string): Promise<Usuario[]> {
  const { data, error } = await requireSupabase().from('usuarios').select('*').eq('unidade_id', unidadeId).eq('papel', 'equipe_franqueado')
  falhou(error)
  return ((data ?? []) as LinhaUsuario[]).map(mapUsuarioSupabase).filter((u): u is Usuario => u !== null)
}

export async function atualizarUsuarioSb(uid: string, patch: PatchUsuario): Promise<void> {
  const { data, error } = await requireSupabase().from('usuarios').update(patchUsuarioParaLinha(patch)).eq('id', uid).select('id')
  falhou(error)
  if (!data?.length) throw new Error('Sem permissão para alterar esse perfil.')
}

export async function atualizarUnidadeSb(id: string, patch: { nome: string; cidade: string; responsavel: string; modulosLiberados: string[]; ativo: boolean }): Promise<void> {
  const { error } = await requireSupabase().rpc('atualizar_unidade', {
    p_id: id,
    p_nome: patch.nome,
    p_cidade: patch.cidade,
    p_responsavel: patch.responsavel,
    p_modulos: patch.modulosLiberados,
    p_ativo: patch.ativo,
  })
  falhou(error)
}

export type PedidoCriarConta =
  | { tipo: 'equipe'; email: string; nome: string; papel: string; ativo: boolean; unidade: string; cidade: string; unidadeId: string | null; modulosLiberados: string[] }
  | { tipo: 'unidade'; email: string; unidadeId: string; nome: string; cidade: string; responsavel: string; modulosLiberados: string[] }

export interface LinkSenhaGerado {
  link: string
  expiraEm: string
}

export type ContaCriadaSb = { uid: string } & (
  LinkSenhaGerado | { link: null; erroLink: string; expiraEm?: undefined }
)

type RespostaCriarConta = { link?: string | null; expiraEm?: string; uid?: string; erro?: string; erroLink?: string }

async function chamarCriarConta(pedido: PedidoCriarConta | { acao: 'link'; uid: string }) {
  const { data, error } = await requireSupabase().functions.invoke<RespostaCriarConta>('criar-conta', { body: pedido })
  if (error) {
    let mensagem = error.message
    if (error instanceof FunctionsHttpError) {
      const corpo = await error.context.json().catch(() => null)
      if (corpo && typeof corpo.erro === 'string') mensagem = corpo.erro
    }
    throw new Error(mensagem)
  }
  return data
}

export async function criarContaSb(pedido: PedidoCriarConta): Promise<ContaCriadaSb> {
  const data = await chamarCriarConta(pedido)
  if (!data?.uid) throw new Error(data?.erro || 'Não foi possível criar a conta.')
  if (data.link && data.expiraEm) return { uid: data.uid, link: data.link, expiraEm: data.expiraEm }
  return { uid: data.uid, link: null, erroLink: data.erroLink || 'Não foi possível gerar o link.' }
}

export async function gerarLinkSenhaSb(uid: string): Promise<LinkSenhaGerado> {
  const data = await chamarCriarConta({ acao: 'link', uid })
  if (!data?.link || !data.expiraEm) throw new Error(data?.erro || 'Não foi possível gerar o link.')
  return { link: data.link, expiraEm: data.expiraEm }
}

export async function enviarRedefinicaoSb(email: string): Promise<void> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo })
  falhou(error)
}
