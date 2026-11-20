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
  | { tipo: 'equipe'; email: string; senha: string; nome: string; papel: string; ativo: boolean; unidade: string; cidade: string; unidadeId: string | null; modulosLiberados: string[] }
  | { tipo: 'unidade'; email: string; senha: string; unidadeId: string; nome: string; cidade: string; responsavel: string; modulosLiberados: string[] }

/** Chama a Edge Function criar-conta com a sessão atual; devolve o id do login novo. */
export async function criarContaSb(pedido: PedidoCriarConta): Promise<string> {
  const { data, error } = await requireSupabase().functions.invoke<{ uid?: string; erro?: string }>('criar-conta', { body: pedido })
  if (error) {
    let mensagem = error.message
    if (error instanceof FunctionsHttpError) {
      const corpo = await error.context.json().catch(() => null)
      if (corpo && typeof corpo.erro === 'string') mensagem = corpo.erro
    }
    throw new Error(mensagem)
  }
  if (!data?.uid) throw new Error(data?.erro || 'Não foi possível criar a conta.')
  return data.uid
}

export async function enviarRedefinicaoSb(email: string): Promise<void> {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo })
  falhou(error)
}
