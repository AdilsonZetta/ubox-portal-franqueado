// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it } from 'vitest'
import type { Usuario } from '../types'
import * as sb from './manuaisSupabase'

const usuario: Usuario = {
  uid: 'uid', nome: 'Ana', email: 'ana@example.test', papel: 'franqueado',
  ativo: true, recusado: false, unidade: 'Loja', unidadeId: null, cidade: '',
}
const audiencia = { publico: false, unidades: ['Loja'], papeis: [], uidsExtra: ['extra'] }
const documento = { id: 'manual-a', versao: 2, titulo: 'Manual A' }
const rascunho = {
  titulo: ' Manual A ', categoriaId: 'cat-a', tipo: 'manual', formato: 'richtext',
  status: 'publicado', leituraObrigatoria: true, conteudoHtml: '<p>Passo A</p>',
  htmlConteudo: '', htmlUrl: ' ', anexos: [], ...audiencia,
} as const
const trilha = { ...audiencia, titulo: ' Trilha ', descricao: ' ', notaMinima: 75, publicado: true, itens: [], quizzes: [] }
const item = { documentoId: 'manual-a', titulo: ' ', etapa: ' Início ', ordem: 1, anteriorId: '', ativo: true, consultaLivre: true, tempoMinimoSeg: 10, videoMinutos: 800 }
const certificado = { uid: 'uid', trilhaId: 'trilha-1', trilhaTitulo: 'Trilha', codigo: 'UBX-123', tentativaId: 'sem-quiz', nome: 'Ana' }
const data = '2026-11-20T12:00:00Z'

describe('Linhas da fase 3', () => {
  it('converte nomes de colunas, valores legados e carimbos para o app', () => {
    expect(sb.mapCategoriaSb({ id: 'cat-a', publico: null, parent_id: null, uids_extra: ['uid'] }))
      .toMatchObject({ id: 'cat-a', nome: 'cat-a', publico: true, parentId: null, uidsExtra: ['uid'] })
    expect(sb.mapDocumentoSb({ id: 'manual-a-interativo', categoria_id: 'cat-a', conteudo_html: '<p>Passo A</p>', atualizado_por: null, atualizado_em: data }))
      .toMatchObject({ categoriaId: 'cat-a', formato: 'html', conteudoTexto: 'Passo A', atualizadoPor: '', atualizadoEm: new Date(data), anexos: [] })
    expect(sb.mapVersaoSb({ id: 'manual-a/versoes/2', versao_id: '2', autor_id: null }))
      .toMatchObject({ id: '2', versao: 2, autorId: '', formato: 'richtext' })
    expect(sb.mapTrilhaSb({ id: 'trilha-1', nota_minima: null, publicado: null, itens: ['manual-a'] }))
      .toMatchObject({ notaMinima: 70, publicado: true, itens: [{ tipo: 'documento', refId: 'manual-a' }] })
    expect(sb.mapQuizSb({ id: 'quiz-1', trilha_id: 'trilha-1', perguntas: null }))
      .toMatchObject({ trilhaId: 'trilha-1', perguntas: [] })
    expect(sb.mapGabaritoSb({ respostas: [1], dados: { origem: 'legado' } })).toEqual({ respostas: [1], origem: 'legado' })
    expect(sb.mapGabaritoSb({ respostas: null, dados: { gabarito: [0] } })).toEqual({ gabarito: [0] })
    expect(sb.mapAvisoSb({ id: 'av-1', documento_id: 'manual-a', tipo: null })).toMatchObject({ documentoId: 'manual-a', tipo: 'novo' })
    expect(sb.mapLeituraSb({ id: 'uid_manual-a_v2', documento_id: 'manual-a', versao: null, lido_em: data }))
      .toMatchObject({ id: 'uid_manual-a_v2', documentoId: 'manual-a', versao: 1, lidoEm: new Date(data) })
    expect(sb.mapAceiteSb({ id: 'uid_manual-a_v2', documento_id: 'manual-a', aceito_em: null })).toMatchObject({ documentoId: 'manual-a', aceitoEm: null })
    expect(sb.mapTentativaSb({ id: 'tentativa', quiz_id: 'quiz-1', respostas: [1, null], aprovado: null }))
      .toMatchObject({ quizId: 'quiz-1', respostas: [1], aprovado: false })
    expect(sb.mapCertificadoSb({ id: 'uid_trilha-1', trilha_id: 'trilha-1', tentativa_id: 'sem-quiz' }))
      .toMatchObject({ trilhaId: 'trilha-1', tentativaId: 'sem-quiz' })
    expect(sb.mapAvisoLeituraSb({ id: 'uid_av-1', aviso_id: 'av-1' })).toMatchObject({ avisoId: 'av-1' })
    expect(sb.mapItemTrilhaSb({ id: 'manual-a', tempo_minimo_seg: null, consulta_livre: true, atualizado_por_nome: 'Ana' }))
      .toMatchObject({ documentoId: 'manual-a', tempoMinimoSeg: 60, consultaLivre: true, atualizadoPorNome: 'Ana' })
    expect(sb.mapProgressoSb({ id: 'uid_manual-a', documento_id: 'manual-a', iniciado_em: data, segundos_ativos: 20, pausado_em: data, concluido_em: null }))
      .toMatchObject({ documentoId: 'manual-a', iniciadoEm: new Date(data), segundosAtivos: 20, pausadoEm: new Date(data), concluidoEm: null, status: 'em_andamento' })
  })

  it('grava conteúdo e audiência sem carimbos e usa o id local da versão', () => {
    const dados = { ...rascunho, ...audiencia, anexos: [] }
    expect(sb.categoriaParaLinha('cat-a', { ...audiencia, nome: ' A ', descricao: ' B ', ordem: 2, parentId: null }, [usuario]))
      .toEqual({ id: 'cat-a', nome: 'A', descricao: 'B', ordem: 2, parent_id: null, publico: false, unidades: ['Loja'], papeis: [], uids_extra: ['extra'], uids: ['extra', 'uid'] })
    const linha = sb.documentoParaLinha('manual-a', dados, usuario, [usuario], 2)
    expect(linha).toEqual({
      id: 'manual-a', titulo: 'Manual A', categoria_id: 'cat-a', tipo: 'manual', formato: 'richtext',
      status: 'publicado', leitura_obrigatoria: true, conteudo_html: '<p>Passo A</p>', conteudo_texto: 'Passo A',
      html_conteudo: '', html_url: '', anexos: [], publico: false, unidades: ['Loja'], papeis: [],
      uids_extra: ['extra'], uids: ['extra', 'uid'], atualizado_por: 'uid', atualizado_por_nome: 'Ana', versao: 2,
    })
    expect(sb.versaoParaLinha(linha, usuario)).toEqual({
      documento_id: 'manual-a', versao_id: '2', versao: 2, titulo: 'Manual A', formato: 'richtext',
      conteudo_html: '<p>Passo A</p>', conteudo_texto: 'Passo A', html_conteudo: '', html_url: '', autor_id: 'uid', autor_nome: 'Ana',
    })
    expect(sb.avisoParaLinha('av-1', linha, true)).toMatchObject({ id: 'av-1', documento_id: 'manual-a', titulo: 'Atualizado: Manual A', tipo: 'atualizado', uids_extra: ['extra'] })
    expect(sb.trilhaParaLinha('trilha-1', trilha, [usuario])).toMatchObject({ id: 'trilha-1', titulo: 'Trilha', nota_minima: 75, uids: ['extra', 'uid'] })
    expect(sb.quizParaLinha({ id: 'quiz-1', titulo: ' Quiz ', perguntas: [] }, sb.trilhaParaLinha('trilha-1', trilha, [])))
      .toMatchObject({ id: 'quiz-1', trilha_id: 'trilha-1', titulo: 'Quiz', nota_minima: 75, publicado: true })
  })

  it('preserva as chaves compostas nas inserções', () => {
    expect(sb.leituraParaLinha(usuario, documento)).toEqual({ id: 'uid_manual-a_v2', uid: 'uid', documento_id: 'manual-a', versao: 2, titulo: 'Manual A' })
    expect(sb.aceiteParaLinha(usuario, documento)).toMatchObject({ id: 'uid_manual-a_v2', nome: 'Ana', email: 'ana@example.test', texto: 'Li e concordo' })
    expect(sb.certificadoParaLinha(certificado)).toEqual({ id: 'uid_trilha-1', uid: 'uid', trilha_id: 'trilha-1', trilha_titulo: 'Trilha', codigo: 'UBX-123', tentativa_id: 'sem-quiz', nome: 'Ana' })
    expect(sb.avisoLeituraParaLinha('uid', 'av-1')).toEqual({ id: 'uid_av-1', uid: 'uid', aviso_id: 'av-1' })
    expect(sb.itemTrilhaParaLinha(item, usuario)).toEqual({
      id: 'manual-a', documento_id: 'manual-a', titulo: 'Manual', etapa: 'Início', ordem: 1,
      anterior_id: '', ativo: true, consulta_livre: true, tempo_minimo_seg: 30, video_minutos: 600, atualizado_por: 'uid', atualizado_por_nome: 'Ana',
    })
    expect(sb.progressoParaLinha(usuario, item)).toEqual({
      id: 'uid_manual-a', uid: 'uid', documento_id: 'manual-a', nome: 'Ana', unidade_id: '',
      unidade_nome: 'Loja', status: 'em_andamento', reinicios: 0, tempo_minimo_seg: 10,
    })
  })

  it('gera ids no formato automático do Firestore', () => {
    expect(sb.novoId()).toMatch(/^[A-Za-z0-9]{20}$/)
  })

  it('recusa o registro de tentativa', async () => {
    await expect(sb.registrarTentativaSb({
      uid: 'uid', quizId: 'quiz-1', trilhaId: 'trilha-1', respostas: [0], nota: 100, aprovado: true,
    })).rejects.toThrow('Sem permissão')
  })
})
