// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { Timestamp } from 'firebase/firestore'
import { slaHoras, STATUS_PENDENTES, type StatusChamado } from '../data/chamados'
import { mapChamado, type Chamado, type EventoChamado } from './chamados'
import { requireSupabase } from './supabase'

type Linha = Record<string, unknown> & { id: string }
type FiltroChamados = { rede: boolean; unidadeId?: string | null }

function dataSb(valor: unknown): Timestamp | undefined {
  const milissegundos = typeof valor === 'string' ? Date.parse(valor) : NaN
  return Number.isFinite(milissegundos) ? Timestamp.fromMillis(milissegundos) : undefined
}

export function mapChamadoSb(linha: Linha): Chamado | null {
  return mapChamado(linha.id, {
    titulo: linha.titulo,
    categoria: linha.categoria,
    prioridade: linha.prioridade,
    descricao: linha.descricao,
    anexos: linha.anexos,
    status: linha.status,
    unidadeId: linha.unidade_id,
    unidadeNome: linha.unidade_nome,
    abertoPor: linha.aberto_por,
    abertoPorNome: linha.aberto_por_nome,
    responsavelId: linha.responsavel_id,
    responsavelNome: linha.responsavel_nome,
    avaliacao: linha.avaliacao,
    slaHoras: linha.sla_horas,
    criadoEm: dataSb(linha.criado_em),
    atualizadoEm: dataSb(linha.atualizado_em),
    resolvidoEm: dataSb(linha.resolvido_em),
    fechadoEm: dataSb(linha.fechado_em),
    reabertoEm: dataSb(linha.reaberto_em),
    pausadoEm: dataSb(linha.pausado_em),
    pausaAcumuladaSeg: linha.pausa_acumulada_seg,
  })
}

export function mapEventoChamadoSb(linha: Linha): EventoChamado | null {
  const tipo = linha.tipo
  if (tipo !== 'abertura' && tipo !== 'comentario' && tipo !== 'status' && tipo !== 'responsavel') return null
  const texto = (valor: unknown) => typeof valor === 'string' ? valor : ''
  return {
    id: linha.id,
    tipo,
    texto: texto(linha.texto),
    de: texto(linha.de),
    para: texto(linha.para),
    autorId: texto(linha.autor_id),
    autorNome: texto(linha.autor_nome),
    criadoEm: dataSb(linha.criado_em),
  }
}

const alteracoes = new EventTarget()

// Atualiza também entre sessões, sem depender de publicar as tabelas no Realtime.
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
  alteracoes.addEventListener('chamados', atualizar)
  return () => {
    ativo = false
    clearInterval(intervalo)
    alteracoes.removeEventListener('chamados', atualizar)
  }
}

async function listarLinhas(
  ler: (inicio: number, fim: number) => PromiseLike<{ data: Linha[] | null; error: unknown }>,
): Promise<Linha[]> {
  const tamanho = 500
  const linhas: Linha[] = []
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await ler(inicio, inicio + tamanho - 1)
    if (error) throw error
    linhas.push(...(data ?? []))
    if (!data || data.length < tamanho) return linhas
  }
}

export function observarChamadosSb(filtro: FiltroChamados, aoMudar: (lista: Chamado[]) => void, aoErro: (erro: unknown) => void): () => void {
  if (!filtro.rede && !filtro.unidadeId) {
    aoMudar([])
    return () => undefined
  }
  return observar(async () => {
    const linhas = await listarLinhas((inicio, fim) => {
      const consulta = requireSupabase().from('chamados').select('*')
      if (!filtro.rede) consulta.eq('unidade_id', filtro.unidadeId)
      return consulta.order('criado_em', { ascending: false }).order('id').range(inicio, fim)
    })
    return linhas.map(mapChamadoSb).filter((item): item is Chamado => item !== null)
  }, aoMudar, aoErro)
}

export function observarPendentesSb(filtro: FiltroChamados, aoMudar: (total: number) => void): () => void {
  return observarChamadosSb(filtro,
    (chamados) => aoMudar(chamados.filter((chamado) => (STATUS_PENDENTES as string[]).includes(chamado.status)).length),
    () => aoMudar(0))
}

export function observarEventosSb(chamadoId: string, aoMudar: (eventos: EventoChamado[]) => void, aoErro: (erro: unknown) => void): () => void {
  return observar(async () => {
    const linhas = await listarLinhas((inicio, fim) => requireSupabase().from('chamado_eventos')
      .select('*').eq('chamado_id', chamadoId).order('criado_em').order('id').range(inicio, fim))
    return linhas.map(mapEventoChamadoSb).filter((item): item is EventoChamado => item !== null)
  }, aoMudar, aoErro)
}

type Autor = Parameters<typeof import('./chamados').abrirChamado>[0]
type DadosAbertura = Parameters<typeof import('./chamados').abrirChamado>[1]

function evento(autor: Autor, tipo: EventoChamado['tipo'], texto: string, de = '', para = '') {
  return { tipo, texto: texto.slice(0, 2000), de, para, autor_nome: autor.nome }
}

function avisarAlteracao() {
  alteracoes.dispatchEvent(new Event('chamados'))
}

async function inserirComentario(autor: Autor, chamadoId: string, texto: string, para = '') {
  const { error } = await requireSupabase().from('chamado_eventos').insert({
    ...evento(autor, 'comentario', texto, '', para),
    chamado_id: chamadoId,
    autor_id: autor.uid,
  })
  if (error) throw error
}

export async function abrirChamadoSb(autor: Autor, dados: DadosAbertura): Promise<string> {
  if (!autor.unidadeId) throw new Error('Sua conta ainda não está ligada a uma unidade.')
  const banco = requireSupabase()
  const { data: unidade, error: erroUnidade } = await banco.from('unidades').select('nome').eq('id', autor.unidadeId).maybeSingle()
  if (erroUnidade) throw erroUnidade
  if (!unidade) throw new Error('Unidade não encontrada.')
  const { data, error } = await banco.from('chamados').insert({
    titulo: dados.titulo.trim(),
    categoria: dados.categoria,
    prioridade: dados.prioridade,
    descricao: dados.descricao.trim(),
    anexos: dados.anexos.map((anexo) => ({ nome: (anexo.nome || anexo.url).trim().slice(0, 80), url: anexo.url.trim() })),
    unidade_id: autor.unidadeId,
    unidade_nome: unidade.nome,
    aberto_por: autor.uid,
    aberto_por_nome: autor.nome,
    sla_horas: slaHoras(dados.prioridade),
  }).select('id').single()
  if (error) throw error
  try {
    await inserirComentario(autor, data.id, 'Chamado aberto.', 'aberto')
  } finally {
    avisarAlteracao()
  }
  return data.id
}

export async function comentarChamadoSb(autor: Autor, chamadoId: string, textoComentario: string): Promise<void> {
  await inserirComentario(autor, chamadoId, textoComentario.trim())
  avisarAlteracao()
}

export async function mudarStatusSb(autor: Autor, chamado: Chamado, status: StatusChamado, extra: { avaliacao?: number } = {}): Promise<void> {
  const { error } = await requireSupabase().rpc('mudar_status_chamado', {
    chamado: chamado.id,
    status_novo: status,
    nota: extra.avaliacao,
    evento: evento(autor, 'status', `Status: ${status}`, chamado.status, status),
  })
  if (error) throw error
  avisarAlteracao()
}

export async function assumirChamadoSb(autor: Autor, chamado: Chamado, responsavel: { uid: string; nome: string }): Promise<void> {
  const { error } = await requireSupabase().rpc('mudar_status_chamado', {
    chamado: chamado.id,
    status_novo: chamado.status === 'aberto' ? 'em_andamento' : chamado.status,
    responsavel: responsavel.uid,
    nome_responsavel: responsavel.nome,
    evento: evento(autor, 'responsavel', `${responsavel.nome} assumiu o chamado.`, chamado.responsavelNome ?? '', responsavel.nome),
  })
  if (error) throw error
  avisarAlteracao()
}
