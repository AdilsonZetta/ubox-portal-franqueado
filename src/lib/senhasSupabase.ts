// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { Timestamp } from 'firebase/firestore'
import { MAX_VISIVEL_PARA, TEXTO_EVENTO_ACESSO } from '../data/senhas'
import {
  bloqueioAprovarPedido,
  mapAcesso,
  mapEventoAcesso,
  mapSegredo,
  mapSolicitacaoAcesso,
  type Acesso,
  type EventoAcesso,
  type SegredoAcesso,
  type SolicitacaoAcesso,
} from './senhas'
import { requireSupabase } from './supabase'

type Linha = Record<string, unknown> & { id: string }
type Filtro = { rede: boolean; unidadeId?: string | null }
type Operacoes = typeof import('./senhas')

function dataSb(valor: unknown): Timestamp | undefined {
  const milissegundos = typeof valor === 'string' ? Date.parse(valor) : NaN
  return Number.isFinite(milissegundos) ? Timestamp.fromMillis(milissegundos) : undefined
}

export function mapAcessoSb(linha: Linha): Acesso | null {
  return mapAcesso(linha.id, {
    nome: linha.nome,
    categoria: linha.categoria,
    url: linha.url,
    escopo: linha.escopo,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    responsavelId: linha.responsavel_id,
    responsavelNome: linha.responsavel_nome,
    visivelPara: linha.visivel_para,
    visivelParaEquipe: linha.visivel_para_equipe,
    ultimaTrocaEm: dataSb(linha.ultima_troca_em),
    pendenteTroca: linha.pendente_troca,
    criadoPor: linha.criado_por,
    criadoPorNome: linha.criado_por_nome,
    criadoEm: dataSb(linha.criado_em),
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

export function mapSegredoSb(linha: Record<string, unknown>): SegredoAcesso | null {
  return mapSegredo({
    login: linha.login,
    senha: linha.senha,
    notas: linha.notas,
    atualizadoEm: dataSb(linha.atualizado_em),
    atualizadoPor: linha.atualizado_por,
  })
}

export function mapEventoAcessoSb(linha: Linha): EventoAcesso | null {
  return mapEventoAcesso(linha.id, {
    tipo: linha.tipo,
    texto: linha.texto,
    autorId: linha.autor_id,
    autorNome: linha.autor_nome,
    criadoEm: dataSb(linha.criado_em),
  })
}

export function mapSolicitacaoAcessoSb(linha: Linha): SolicitacaoAcesso | null {
  return mapSolicitacaoAcesso(linha.id, {
    tipo: linha.tipo,
    status: linha.status,
    acessoId: linha.acesso_id,
    acessoNome: linha.acesso_nome,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    solicitadoPor: linha.solicitado_por,
    solicitadoPorNome: linha.solicitado_por_nome,
    motivo: linha.motivo,
    alvoUid: linha.alvo_uid,
    alvoNome: linha.alvo_nome,
    decididoPor: linha.decidido_por,
    decididoPorNome: linha.decidido_por_nome,
    criadoEm: dataSb(linha.criado_em),
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

const alteracoes = new EventTarget()

// Atualiza a sessão local após a escrita e consulta mudanças de outras sessões a cada 15 segundos.
function observar<T>(ler: () => Promise<T>, aoMudar: (valor: T) => void, aoErro: (erro: unknown) => void): () => void {
  let ativo = true
  let lendo = false
  let pendente = false

  async function atualizar() {
    if (lendo) {
      pendente = true
      return
    }

    lendo = true
    try {
      const resultado = await ler()
      if (ativo && !pendente) aoMudar(resultado)
    } catch (erro) {
      if (ativo && !pendente) aoErro(erro)
    } finally {
      lendo = false
      if (ativo && pendente) {
        pendente = false
        void atualizar()
      }
    }
  }

  void atualizar()
  const intervalo = setInterval(() => { if (!lendo) void atualizar() }, 15000)
  alteracoes.addEventListener('senhas', atualizar)
  return () => {
    ativo = false
    clearInterval(intervalo)
    alteracoes.removeEventListener('senhas', atualizar)
  }
}

function avisarAlteracao() {
  alteracoes.dispatchEvent(new Event('senhas'))
}

async function listar<T>(
  ler: (inicio: number, fim: number) => PromiseLike<{ data: Linha[] | null; error: unknown }>,
  mapear: (linha: Linha) => T | null,
): Promise<T[]> {
  const tamanho = 500
  const itens: T[] = []
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await ler(inicio, inicio + tamanho - 1)
    if (error) throw error
    const pagina = data ?? []
    for (const linha of pagina) {
      const item = mapear(linha)
      if (item !== null) itens.push(item)
    }
    if (pagina.length < tamanho) return itens
  }
}

function listarAcessos(escopo?: Acesso['escopo'], unidadeId?: string) {
  return listar((inicio, fim) => {
    const consulta = requireSupabase().from('acessos').select('*')
    if (escopo) consulta.eq('escopo', escopo)
    if (unidadeId) consulta.eq('unidade_id', unidadeId)
    return consulta.order('id').range(inicio, fim)
  }, mapAcessoSb)
}

export const observarAcessosSb: Operacoes['observarAcessos'] = (filtro, aoMudar, aoErro) => {
  const { unidadeId } = filtro
  if (!filtro.rede && !unidadeId) {
    aoMudar([])
    return () => undefined
  }

  return observar(async () => {
    const grupos = filtro.rede
      ? [await listarAcessos()]
      : await Promise.all([listarAcessos('unidade', unidadeId ?? undefined), listarAcessos('rede')])
    return grupos.flat().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, aoMudar, aoErro)
}

export const buscarSegredoSb: Operacoes['buscarSegredo'] = async (acessoId) => {
  try {
    const { data, error } = await requireSupabase().from('acesso_segredos')
      .select('login,senha,notas,atualizado_em,atualizado_por').eq('acesso_id', acessoId).maybeSingle()
    if (error) throw error
    const segredo = data ? mapSegredoSb(data) : null
    if (segredo) return segredo
  } catch {
    // Mantém os detalhes da consulta fora dos erros exibidos.
    throw new Error('Não foi possível consultar a credencial.')
  }
  throw new Error('Segredo não encontrado ou você não tem permissão para visualizá-lo.')
}

export const observarEventosAcessoSb: Operacoes['observarEventosAcesso'] = (acessoId, aoMudar, aoErro) => {
  return observar(() => listar((inicio, fim) => requireSupabase().from('acesso_eventos')
    .select('*').eq('acesso_id', acessoId).order('criado_em', { ascending: false }).order('id').range(inicio, fim),
  mapEventoAcessoSb), aoMudar, aoErro)
}

export const gravarEventoAcessoSb: Operacoes['gravarEventoAcesso'] = async (acessoId, autor, tipo) => {
  const { error } = await requireSupabase().from('acesso_eventos').insert({
    acesso_id: acessoId,
    tipo,
    texto: TEXTO_EVENTO_ACESSO[tipo],
    autor_id: autor.uid,
    autor_nome: autor.nome,
  })
  if (error) throw new Error('Não foi possível registrar o evento do acesso.')
  avisarAlteracao()
}

async function executarRpc(nome: string, argumentos: Record<string, unknown>, mensagem: string): Promise<unknown> {
  try {
    const { data, error } = await requireSupabase().rpc(nome, argumentos)
    if (!error) {
      avisarAlteracao()
      return data
    }
  } catch {
    // Mantém detalhes do banco e do transporte fora dos erros exibidos pelo portal.
  }
  throw new Error(mensagem)
}

export const criarAcessoSb: Operacoes['criarAcesso'] = async (_autor, dados) => {
  const unidade = dados.escopo === 'unidade'
  const unidadeId = unidade ? dados.unidadeId.trim() : ''
  if (unidade && !unidadeId) throw new Error('Unidade é obrigatória para acessos da unidade.')

  const mensagem = 'Não foi possível criar o acesso.'
  const id = await executarRpc('criar_acesso', {
    metadados: {
      nome: dados.nome.trim(),
      categoria: dados.categoria,
      url: dados.url.trim(),
      escopo: dados.escopo,
      unidade_id: unidadeId,
      responsavel_id: dados.responsavelId || null,
      responsavel_nome: dados.responsavelNome.trim() || 'Equipe da unidade',
      visivel_para: unidade ? dados.visivelPara.slice(0, MAX_VISIVEL_PARA) : [],
      visivel_para_equipe: unidade && dados.visivelParaEquipe,
    },
    login_novo: dados.login.trim(),
    senha_nova: dados.senha,
    notas_novas: (dados.notas ?? '').trim(),
  }, mensagem)
  if (typeof id !== 'string') throw new Error(mensagem)
  return id
}

export const atualizarMetadadosAcessoSb: Operacoes['atualizarMetadadosAcesso'] = async (_autor, acesso, patch) => {
  const unidade = acesso.escopo === 'unidade'
  const alteracoes: Record<string, unknown> = {
    nome: patch.nome?.trim(),
    categoria: patch.categoria,
    url: patch.url?.trim(),
    responsavel_id: patch.responsavelId,
    responsavel_nome: patch.responsavelNome?.trim(),
    pendente_troca: patch.pendenteTroca,
  }
  if (patch.visivelPara !== undefined) {
    alteracoes.visivel_para = unidade ? patch.visivelPara.slice(0, MAX_VISIVEL_PARA) : []
  }
  if (patch.visivelParaEquipe !== undefined) alteracoes.visivel_para_equipe = unidade && patch.visivelParaEquipe

  await executarRpc('atualizar_metadados_acesso', { acesso: acesso.id, alteracoes }, 'Não foi possível atualizar o acesso.')
}

export const trocarSenhaAcessoSb: Operacoes['trocarSenhaAcesso'] = async (_autor, acessoId, novosDados) => {
  await executarRpc('trocar_senha_acesso', {
    acesso: acessoId,
    login_novo: novosDados.login.trim(),
    senha_nova: novosDados.senha,
    notas_novas: (novosDados.notas ?? '').trim(),
  }, 'Não foi possível trocar a senha.')
}

function listarSolicitacoes(filtro: Filtro) {
  return listar((inicio, fim) => {
    const consulta = requireSupabase().from('solicitacoes_acesso').select('*')
    if (!filtro.rede) consulta.eq('unidade_id', filtro.unidadeId)
    return consulta.order('criado_em', { ascending: false }).order('id').range(inicio, fim)
  }, mapSolicitacaoAcessoSb)
}

export const observarSolicitacoesSb: Operacoes['observarSolicitacoes'] = (filtro, aoMudar, aoErro) => {
  if (!filtro.rede && !filtro.unidadeId) {
    aoMudar([])
    return () => undefined
  }
  return observar(() => listarSolicitacoes(filtro), aoMudar, aoErro)
}

export const observarSolicitacoesAbertasSb: Operacoes['observarSolicitacoesAbertas'] = (filtro, aoMudar) => {
  return observarSolicitacoesSb(filtro,
    (itens) => aoMudar(itens.filter((item) => item.status === 'aberta').length),
    () => aoMudar(0))
}

export const criarSolicitacaoAcessoSb: Operacoes['criarSolicitacaoAcesso'] = async (autor, dados) => {
  const unidadeId = (autor.unidadeId || dados.unidadeId).trim()
  if (!unidadeId) throw new Error('Unidade é obrigatória para criar solicitação.')

  const banco = requireSupabase()
  const { data: unidade, error: erroUnidade } = await banco.from('unidades').select('nome').eq('id', unidadeId).maybeSingle()
  if (erroUnidade || !unidade) throw new Error('Unidade não encontrada.')

  const { data, error } = await banco.from('solicitacoes_acesso').insert({
    tipo: dados.tipo,
    status: 'aberta',
    acesso_id: dados.acessoId?.trim() ?? '',
    acesso_nome: dados.acessoNome?.trim() ?? '',
    unidade_id: unidadeId,
    unidade_nome: unidade.nome,
    motivo: dados.motivo.trim().slice(0, 2000),
    alvo_uid: dados.alvoUid?.trim() || null,
    alvo_nome: dados.alvoNome?.trim() ?? '',
  }).select('id').single()
  if (error) throw new Error('Não foi possível criar a solicitação.')
  avisarAlteracao()
  return data.id
}

export const decidirSolicitacaoAcessoSb: Operacoes['decidirSolicitacaoAcesso'] = async (
  _decisor, solicitacao, novoStatus, acessoAtual, dadosRevogacao,
) => {
  const aprovada = novoStatus === 'aprovada'
  if (aprovada && (solicitacao.tipo === 'pedir_acesso' || solicitacao.tipo === 'revogar')) {
    if (!solicitacao.acessoId || !acessoAtual) {
      throw new Error('Acesso correspondente não encontrado para aprovação da solicitação.')
    }
    if (!solicitacao.alvoUid) {
      throw new Error('A solicitação não indica quem deve ganhar ou perder o acesso.')
    }
    if (solicitacao.tipo === 'pedir_acesso') {
      const bloqueio = bloqueioAprovarPedido(acessoAtual.visivelPara, solicitacao.alvoUid)
      if (bloqueio) throw new Error(bloqueio)
    }
  }

  const revogando = aprovada && solicitacao.tipo === 'revogar'
  if (revogando && !dadosRevogacao?.novaSenha.trim()) {
    throw new Error('Nova senha é obrigatória para aprovação da revogação com rotação imediata.')
  }

  await executarRpc('decidir_solicitacao_acesso', {
    solicitacao: solicitacao.id,
    status_novo: novoStatus,
    login_novo: revogando ? (dadosRevogacao?.login ?? '').trim() : null,
    senha_nova: revogando ? dadosRevogacao?.novaSenha.trim() : null,
    notas_novas: revogando ? (dadosRevogacao?.notas ?? '').trim() : null,
  }, 'Não foi possível decidir a solicitação.')
}
