// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import type { Usuario } from '../types'
import { codigoCertificado } from './format'
import { certificadoParaLinha } from './manuaisSupabase'
import { requireSupabase } from './supabase'
import {
  idReestudo, idTentativa, limitarReestudo, separarGabarito,
  type Curso, type PerguntaProva, type Prova, type Reestudo, type TentativaProva,
} from './universidade'
import { ProvaAtualizadaError, type CursoEdicao, type ProvaEdicao } from './universidadeApi'

function dataSb(valor: string | null): Date | null {
  if (valor === null) return null
  const ms = Date.parse(valor)
  return Number.isFinite(ms) ? new Date(ms) : null
}

export function mapCursoSb(linha: CursoEdicao & {
  atualizado_por: string | null
  atualizado_por_nome: string
  atualizado_em: string
}): Curso {
  return {
    id: linha.id, titulo: linha.titulo, descricao: linha.descricao,
    ordem: linha.ordem, aulas: linha.aulas, publicado: linha.publicado,
    atualizadoPor: linha.atualizado_por ?? '',
    atualizadoPorNome: linha.atualizado_por_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  }
}

export function mapProvaSb(linha: {
  id: string
  titulo: string
  nota_minima: number
  perguntas: PerguntaProva[]
  total_perguntas: number
  manual_retorno_id: string
  tempo_reestudo_seg: number
  versao: number
  publicado: boolean
  atualizado_por_nome: string
  atualizado_em: string
}): Prova {
  return {
    cursoId: linha.id, titulo: linha.titulo, notaMinima: linha.nota_minima,
    perguntas: linha.perguntas.map(({ id, enunciado, opcoes }) => ({ id, enunciado, opcoes })),
    totalPerguntas: linha.total_perguntas, manualRetornoId: linha.manual_retorno_id,
    tempoReestudoSeg: linha.tempo_reestudo_seg, versao: linha.versao, publicado: linha.publicado,
    atualizadoPorNome: linha.atualizado_por_nome, atualizadoEm: dataSb(linha.atualizado_em),
  }
}

export function mapGabaritoSb(linha: { id: string; corretas: number[] }): [string, number[]] {
  return [linha.id, linha.corretas]
}

export function mapFolhaSb(linha: { tentativa_id: string; respostas: number[] }): [string, number[]] {
  return [linha.tentativa_id, linha.respostas]
}

export function mapTentativaSb(linha: {
  id: string
  uid: string
  curso_id: string
  ciclo: number
  numero: number
  nome: string
  unidade_id: string
  unidade_nome: string
  versao: number
  aprovado: boolean | null
  criado_em: string
  corrigido_em: string | null
}): TentativaProva {
  return {
    id: linha.id, uid: linha.uid, cursoId: linha.curso_id, ciclo: linha.ciclo,
    numero: linha.numero, nome: linha.nome, unidadeId: linha.unidade_id, unidadeNome: linha.unidade_nome,
    versao: linha.versao, aprovado: linha.aprovado,
    criadoEm: dataSb(linha.criado_em), corrigidoEm: dataSb(linha.corrigido_em),
  }
}

export function mapReestudoSb(linha: {
  id: string
  uid: string
  curso_id: string
  ciclo: number
  documento_id: string
  status: Reestudo['status']
  reinicios: number
  iniciado_em: string
  concluido_em: string | null
}): Reestudo {
  return {
    id: linha.id, uid: linha.uid, cursoId: linha.curso_id, ciclo: linha.ciclo,
    documentoId: linha.documento_id, status: linha.status, reinicios: linha.reinicios,
    iniciadoEm: dataSb(linha.iniciado_em), concluidoEm: dataSb(linha.concluido_em),
  }
}

export function cursoParaLinha(autor: Usuario, curso: CursoEdicao) {
  return {
    id: curso.id,
    titulo: curso.titulo.trim().slice(0, 120),
    descricao: curso.descricao.trim().slice(0, 1000),
    ordem: Math.min(999, Math.max(1, Math.round(curso.ordem || 1))),
    aulas: curso.aulas.slice(0, 20),
    publicado: curso.publicado,
    atualizado_por: autor.uid,
    atualizado_por_nome: autor.nome,
  }
}

export function provaParaLinhas(autor: Usuario, prova: ProvaEdicao, versaoAtual: number) {
  const versao = versaoAtual + 1
  const { publicas, corretas } = separarGabarito(prova.perguntas)
  return {
    p_prova: {
      id: prova.cursoId,
      titulo: prova.titulo.trim().slice(0, 120),
      nota_minima: Math.min(100, Math.max(1, Math.round(prova.notaMinima))),
      perguntas: publicas,
      total_perguntas: publicas.length,
      manual_retorno_id: prova.manualRetornoId,
      tempo_reestudo_seg: limitarReestudo(prova.tempoReestudoSeg),
      versao,
      publicado: prova.publicado,
      atualizado_por: autor.uid,
      atualizado_por_nome: autor.nome,
    },
    p_gabarito: { id: prova.cursoId, corretas, versao, atualizado_por: autor.uid },
  }
}

export function envioParaLinhas(usuario: Usuario, prova: Prova, ciclo: number, numero: number, respostas: number[]) {
  const id = idTentativa(usuario.uid, prova.cursoId, ciclo, numero)
  return {
    p_tentativa: {
      id, uid: usuario.uid, curso_id: prova.cursoId, ciclo, numero, nome: usuario.nome,
      unidade_id: usuario.unidadeId ?? '', unidade_nome: usuario.unidade ?? '', versao: prova.versao,
    },
    p_folha: { tentativa_id: id, uid: usuario.uid, versao: prova.versao, respostas },
  }
}

export function correcaoParaLinha(aprovado: boolean) {
  return { aprovado }
}

export function certificadoCursoParaLinha(usuario: Usuario, curso: Curso, tentativaId: string, codigo: string) {
  return certificadoParaLinha({
    uid: usuario.uid, trilhaId: curso.id, nome: usuario.nome,
    trilhaTitulo: curso.titulo.slice(0, 120), tentativaId, codigo,
  })
}

export function reestudoParaLinha(usuario: Usuario, prova: Prova, ciclo: number) {
  return {
    id: idReestudo(usuario.uid, prova.cursoId, ciclo),
    uid: usuario.uid, curso_id: prova.cursoId, ciclo, documento_id: prova.manualRetornoId,
  }
}

export function reinicioReestudoParaLinha(reinicios: number) {
  return { reinicios: reinicios + 1 }
}

export function conclusaoReestudoParaLinha() {
  return { status: 'concluido' }
}

function falhou(erro: { message: string } | null): void {
  if (erro) throw new Error(erro.message)
}

async function listar<Linha, Item>(
  tabela: string,
  mapear: (linha: Linha) => Item,
  filtro?: [coluna: string, valor: string | boolean],
): Promise<Item[]> {
  const banco = requireSupabase()
  const itens: Item[] = []
  const tamanho = 500
  for (let inicio = 0; ; inicio += tamanho) {
    const consulta = banco.from(tabela).select('*').order('id').range(inicio, inicio + tamanho - 1)
    if (filtro) consulta.eq(...filtro)
    const { data, error } = await consulta
    falhou(error)
    itens.push(...(data ?? []).map(mapear))
    if (!data || data.length < tamanho) return itens
  }
}

export function listarCursosSb(gestor: boolean): Promise<Curso[]> {
  return listar('cursos', mapCursoSb, gestor ? undefined : ['publicado', true])
}

export async function obterProvaSb(cursoId: string): Promise<Prova | null> {
  const { data, error } = await requireSupabase().from('provas').select('*').eq('id', cursoId).maybeSingle()
  falhou(error)
  return data ? mapProvaSb(data) : null
}

export function listarProvasSb(): Promise<Prova[]> {
  return listar('provas', mapProvaSb)
}

export async function listarGabaritosSb(): Promise<Map<string, number[]>> {
  return new Map(await listar('provas_gabarito', mapGabaritoSb))
}

export function listarMinhasTentativasSb(uid: string): Promise<TentativaProva[]> {
  return listar('tentativas_prova', mapTentativaSb, ['uid', uid])
}

export function listarMeusReestudosSb(uid: string): Promise<Reestudo[]> {
  return listar('reestudos', mapReestudoSb, ['uid', uid])
}

export async function listarResultadosSb(usuario: Usuario, gestor: boolean): Promise<TentativaProva[]> {
  if (gestor) return listar('tentativas_prova', mapTentativaSb)
  if (usuario.papel !== 'franqueado' || !usuario.unidadeId) return []
  return listar('tentativas_prova', mapTentativaSb, ['unidade_id', usuario.unidadeId])
}

export async function listarFolhasSb(tentativas: TentativaProva[]): Promise<Map<string, number[]>> {
  const folhas = new Map<string, number[]>()
  const ids = [...new Set(tentativas.map(({ id }) => id))]
  // Limita o tamanho da URL do filtro e mantém a leitura em lotes.
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await requireSupabase().from('tentativas_prova_folha')
      .select('tentativa_id,respostas').in('tentativa_id', ids.slice(i, i + 50))
    falhou(error)
    for (const linha of data ?? []) {
      const [id, respostas] = mapFolhaSb(linha)
      folhas.set(id, respostas)
    }
  }
  return folhas
}

export async function salvarCursoSb(autor: Usuario, curso: CursoEdicao): Promise<void> {
  const { error } = await requireSupabase().from('cursos').upsert(cursoParaLinha(autor, curso))
  falhou(error)
}

export async function salvarProvaSb(autor: Usuario, prova: ProvaEdicao, versaoAtual: number): Promise<number> {
  const linhas = provaParaLinhas(autor, prova, versaoAtual)
  // Contrato pendente no schema: a RPC deve gravar prova e gabarito na mesma
  // transação, sob o papel de quem chamou. As FKs adiadas impedem dois upserts REST.
  const { error } = await requireSupabase().rpc('salvar_prova_universidade', linhas)
  if (error?.code === 'PGRST202') throw new Error('O Supabase ainda não oferece a gravação atômica da prova e do gabarito.')
  falhou(error)
  return linhas.p_prova.versao
}

function atualizarResultado(id: string, aprovado: boolean) {
  return requireSupabase().from('tentativas_prova').update(correcaoParaLinha(aprovado))
    .eq('id', id).is('aprovado', null).select('aprovado').maybeSingle()
}

export async function fecharTentativaPendenteSb(id: string): Promise<void> {
  const { data, error } = await atualizarResultado(id, false)
  falhou(error)
  if (!data) throw new Error('Não foi possível fechar a tentativa pendente.')
}

export async function corrigirTentativaSb(id: string): Promise<boolean> {
  const primeira = await atualizarResultado(id, true)
  // O gatilho compara com o gabarito privado e carimba a correção aceita.
  const resultado = primeira.error?.code === '42501' && primeira.error.message === 'Resultado da tentativa inválido.'
    ? await atualizarResultado(id, false)
    : primeira
  falhou(resultado.error)
  if (resultado.data) return resultado.data.aprovado === true

  // Uma correção concorrente pode já ter encerrado a tentativa.
  const { data, error } = await requireSupabase().from('tentativas_prova')
    .select('aprovado').eq('id', id).maybeSingle()
  falhou(error)
  if (typeof data?.aprovado === 'boolean') return data.aprovado
  throw new Error('Não foi possível corrigir a tentativa.')
}

export async function enviarTentativaSb(
  usuario: Usuario, prova: Prova, ciclo: number, numero: number, respostas: number[],
): Promise<{ id: string; aprovado: boolean; provaAtualizada: boolean }> {
  const linhas = envioParaLinhas(usuario, prova, ciclo, numero, respostas)
  const id = linhas.p_tentativa.id
  // Contrato pendente no schema: a RPC deve inserir a tentativa antes da folha,
  // na mesma transação e sob o papel de quem chamou. Se a folha falhar, ambas
  // as escritas devem ser revertidas para preservar a chance.
  const { error } = await requireSupabase().rpc('enviar_tentativa_universidade', linhas)
  if (error?.code === 'PGRST202') throw new Error('O Supabase ainda não oferece o envio atômico da tentativa e da folha.')
  if (error?.code === '42501') {
    const atual = await obterProvaSb(prova.cursoId).catch(() => null)
    if (atual && atual.versao !== prova.versao) throw new ProvaAtualizadaError()
  }
  falhou(error)
  const aprovado = await corrigirTentativaSb(id)
  const atual = aprovado ? null : await obterProvaSb(prova.cursoId).catch(() => null)
  return { id, aprovado, provaAtualizada: Boolean(atual && atual.versao !== prova.versao) }
}

export async function emitirCertificadoCursoSb(usuario: Usuario, curso: Curso, tentativaId: string): Promise<string> {
  const linha = certificadoCursoParaLinha(usuario, curso, tentativaId, codigoCertificado(curso.id))
  const { error } = await requireSupabase().from('certificados').insert(linha)
  falhou(error)
  return linha.id
}

async function obterReestudo(id: string): Promise<Reestudo | null> {
  const { data, error } = await requireSupabase().from('reestudos').select('*').eq('id', id).maybeSingle()
  falhou(error)
  return data ? mapReestudoSb(data) : null
}

export async function iniciarOuReiniciarReestudoSb(usuario: Usuario, prova: Prova, ciclo: number): Promise<Reestudo | null> {
  const linha = reestudoParaLinha(usuario, prova, ciclo)
  const atual = await obterReestudo(linha.id)
  if (atual?.status === 'concluido') return atual
  const tabela = requireSupabase().from('reestudos')
  if (atual) {
    const { error } = await tabela.update(reinicioReestudoParaLinha(atual.reinicios))
      .eq('id', linha.id).eq('status', 'em_andamento').eq('reinicios', atual.reinicios)
    falhou(error)
  } else {
    const { error } = await tabela.insert(linha)
    // Outra chamada pode ter iniciado o mesmo reestudo enquanto esta lia.
    if (error?.code !== '23505') falhou(error)
  }
  return obterReestudo(linha.id)
}

export async function concluirReestudoSb(usuario: Usuario, cursoId: string, ciclo: number): Promise<void> {
  const id = idReestudo(usuario.uid, cursoId, ciclo)
  const { data, error } = await requireSupabase().from('reestudos').update(conclusaoReestudoParaLinha())
    .eq('id', id).eq('status', 'em_andamento').select('id').maybeSingle()
  falhou(error)
  if (!data && (await obterReestudo(id))?.status !== 'concluido') {
    throw new Error('Não foi possível concluir o reestudo.')
  }
}
