// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, expect, it } from 'vitest'
import type { Usuario } from '../types'
import {
  certificadoCursoParaLinha, correcaoParaLinha, cursoParaLinha, envioParaLinhas,
  mapCursoSb, mapFolhaSb, mapGabaritoSb, mapProvaSb, mapReestudoSb, mapTentativaSb,
  provaParaLinhas, reestudoParaLinha, reinicioReestudoParaLinha, conclusaoReestudoParaLinha,
} from './universidadeSupabase'

const usuario: Usuario = {
  uid: 'u1', nome: 'Pessoa Teste', email: 'pessoa@example.test', unidade: 'Unidade A',
  unidadeId: 'un-a', cidade: '', papel: 'franqueado', ativo: true, recusado: false,
}
const data = '2026-11-20T15:00:00Z'
const perguntas = [{ id: 'p1', enunciado: 'Qual?', opcoes: ['A', 'B'] }]
const curso = { id: 'curso-a', titulo: 'Curso A', ordem: 2, descricao: 'Descrição', aulas: ['man-1'], publicado: true }
const prova = {
  cursoId: 'curso-a', titulo: 'Prova A', notaMinima: 75, perguntas, totalPerguntas: 1,
  manualRetornoId: 'man-1', tempoReestudoSeg: 60, versao: 2, publicado: true,
}

describe('mapeadores da Universidade', () => {
  it('mapeia curso com autor excluído e carimbo do servidor', () => {
    expect(mapCursoSb({ ...curso, atualizado_por: null, atualizado_por_nome: 'Pessoa Teste', atualizado_em: data }))
      .toEqual({ ...curso, atualizadoPor: '', atualizadoPorNome: 'Pessoa Teste', atualizadoEm: new Date(data) })
  })

  it('mapeia a prova pública com o ID do curso e a versão', () => {
    expect(mapProvaSb({
      id: 'curso-a', titulo: 'Prova A', nota_minima: 75, perguntas, total_perguntas: 1,
      manual_retorno_id: 'man-1', tempo_reestudo_seg: 60, versao: 2, publicado: true,
      atualizado_por_nome: 'Pessoa Teste', atualizado_em: data,
    })).toEqual({ ...prova, atualizadoPorNome: 'Pessoa Teste', atualizadoEm: new Date(data) })
  })

  it('preserva o índice zero e a chave do gabarito e da folha', () => {
    expect(mapGabaritoSb({ id: 'curso-a', corretas: [1, 0] })).toEqual(['curso-a', [1, 0]])
    expect(mapFolhaSb({ tentativa_id: 'u1_curso-a_1_2', respostas: [0, 1] })).toEqual(['u1_curso-a_1_2', [0, 1]])
  })

  it.each([null, false, true])('preserva o resultado %s de uma tentativa', (aprovado) => {
    const corrigido = aprovado === null ? null : data
    expect(mapTentativaSb({
      id: 'u1_curso-a_1_2', uid: 'u1', curso_id: 'curso-a', ciclo: 1, numero: 2,
      nome: 'Pessoa Teste', unidade_id: 'un-a', unidade_nome: 'Unidade A', versao: 2,
      aprovado, criado_em: data, corrigido_em: corrigido,
    })).toEqual({
      id: 'u1_curso-a_1_2', uid: 'u1', cursoId: 'curso-a', ciclo: 1, numero: 2,
      nome: 'Pessoa Teste', unidadeId: 'un-a', unidadeNome: 'Unidade A', versao: 2,
      aprovado, criadoEm: new Date(data), corrigidoEm: corrigido ? new Date(corrigido) : null,
    })
  })

  it('mapeia o relógio e o estado do reestudo', () => {
    expect(mapReestudoSb({
      id: 'u1_curso-a_1', uid: 'u1', curso_id: 'curso-a', ciclo: 1, documento_id: 'man-1',
      status: 'concluido', reinicios: 3, iniciado_em: data, concluido_em: data,
    })).toEqual({
      id: 'u1_curso-a_1', uid: 'u1', cursoId: 'curso-a', ciclo: 1, documentoId: 'man-1',
      status: 'concluido', reinicios: 3, iniciadoEm: new Date(data), concluidoEm: new Date(data),
    })
  })
})

describe('payloads da Universidade', () => {
  it('normaliza os campos de edição do curso', () => {
    expect(cursoParaLinha(usuario, { ...curso, titulo: ' Curso A ', ordem: 2000 }))
      .toEqual({ ...curso, ordem: 999, atualizado_por: 'u1', atualizado_por_nome: 'Pessoa Teste' })
  })

  it('separa prova e gabarito mantendo a mesma versão', () => {
    expect(provaParaLinhas(usuario, {
      ...prova, notaMinima: 105, tempoReestudoSeg: 10, perguntas: [{ ...perguntas[0], correta: 0 }],
    }, 2)).toEqual({
      p_prova: {
        id: 'curso-a', titulo: 'Prova A', nota_minima: 100, perguntas, total_perguntas: 1,
        manual_retorno_id: 'man-1', tempo_reestudo_seg: 30, versao: 3, publicado: true,
        atualizado_por: 'u1', atualizado_por_nome: 'Pessoa Teste',
      },
      p_gabarito: { id: 'curso-a', corretas: [0], versao: 3, atualizado_por: 'u1' },
    })
  })

  it('associa a folha à tentativa sem pôr as respostas na tentativa', () => {
    expect(envioParaLinhas(usuario, prova, 1, 2, [0])).toEqual({
      p_tentativa: {
        id: 'u1_curso-a_1_2', uid: 'u1', curso_id: 'curso-a', ciclo: 1, numero: 2,
        nome: 'Pessoa Teste', unidade_id: 'un-a', unidade_nome: 'Unidade A', versao: 2,
      },
      p_folha: { tentativa_id: 'u1_curso-a_1_2', uid: 'u1', versao: 2, respostas: [0] },
    })
  })

  it('envia somente o resultado ao gatilho de correção', () => {
    expect(correcaoParaLinha(true)).toEqual({ aprovado: true })
    expect(correcaoParaLinha(false)).toEqual({ aprovado: false })
  })

  it('vincula o certificado à tentativa e deixa o servidor carimbar a emissão', () => {
    expect(certificadoCursoParaLinha(usuario, curso, 'u1_curso-a_1_2', 'UBX-CURS-123')).toEqual({
      id: 'u1_curso-a', uid: 'u1', trilha_id: 'curso-a', nome: 'Pessoa Teste',
      trilha_titulo: 'Curso A', tentativa_id: 'u1_curso-a_1_2', codigo: 'UBX-CURS-123',
    })
  })

  it('omite iniciado_em e todos os carimbos em cada escrita de reestudo', () => {
    const inicio = reestudoParaLinha(usuario, prova, 1)
    const reinicio = reinicioReestudoParaLinha(2)
    const conclusao = conclusaoReestudoParaLinha()
    expect(inicio).toEqual({ id: 'u1_curso-a_1', uid: 'u1', curso_id: 'curso-a', ciclo: 1, documento_id: 'man-1' })
    expect(reinicio).toEqual({ reinicios: 3 })
    expect(conclusao).toEqual({ status: 'concluido' })
    for (const payload of [inicio, reinicio, conclusao]) {
      for (const campo of ['iniciado_em', 'concluido_em', 'criado_em', 'atualizado_em']) {
        expect(payload).not.toHaveProperty(campo)
      }
    }
  })
})
