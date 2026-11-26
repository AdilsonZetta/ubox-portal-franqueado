import { describe, expect, it } from 'vitest'
import {
  contarPalavras,
  encadearTrilha,
  estadoDoManual,
  formatarDuracao,
  idProgresso,
  limitarTempo,
  montarTrilhaDoUsuario,
  resumirProgresso,
  saiuDaTela,
  segundosRestantes,
  segundosAtivosAgora,
  restanteAtivo,
  proximoPassoDaTrilha,
  alteracoesNaTrilha,
  tempoSugeridoSeg,
  type ItemTrilhaManual,
} from './manuaisTrilha'
import { rotuloExibicao, seloExibicao, tipoExibicao, tiposPresentes } from './format'

function item(id: string, ordem: number, anteriorId: string, extra: Partial<ItemTrilhaManual> = {}): ItemTrilhaManual {
  return { documentoId: id, titulo: `Manual ${id}`, etapa: 'Etapa 1', ordem, tempoMinimoSeg: 60, videoMinutos: 0, anteriorId, ativo: true, consultaLivre: false, ...extra }
}

describe('Trilha sequencial de manuais', () => {
  it('usa o id uid_documento igual às rules', () => {
    expect(idProgresso('u1', 'doc-a')).toBe('u1_doc-a')
  })

  it('libera só o primeiro e o próximo depois do concluído', () => {
    const itens = [item('a', 1, ''), item('b', 2, 'a'), item('c', 3, 'b')]
    const etapas = montarTrilhaDoUsuario(itens, [{ documentoId: 'a', status: 'concluido' }])
    expect(etapas[0].itens.map((i) => i.estado)).toEqual(['concluido', 'disponivel', 'bloqueado'])
  })

  it('em andamento continua em andamento e não libera o seguinte', () => {
    const mapa = new Map([['a', { status: 'em_andamento' as const }]])
    expect(estadoDoManual(item('a', 1, ''), mapa)).toBe('em_andamento')
    expect(estadoDoManual(item('b', 2, 'a'), mapa)).toBe('bloqueado')
  })

  it('agrupa por etapa na ordem e ignora inativos', () => {
    const itens = [item('b', 2, 'a', { etapa: 'Etapa 2' }), item('a', 1, ''), item('x', 3, '', { ativo: false })]
    const etapas = montarTrilhaDoUsuario(itens, [])
    expect(etapas.map((e) => e.etapa)).toEqual(['Etapa 1', 'Etapa 2'])
    expect(etapas.flatMap((e) => e.itens.map((i) => i.documentoId))).toEqual(['a', 'b'])
  })

  it('encadeia ordem e anterior pulando inativos', () => {
    const saida = encadearTrilha([
      { documentoId: 'a', ativo: true },
      { documentoId: 'x', ativo: false },
      { documentoId: 'b', ativo: true },
    ])
    expect(saida.map((i) => [i.documentoId, i.ordem, i.anteriorId])).toEqual([
      ['a', 1, ''],
      ['b', 2, 'a'],
      ['x', 3, ''],
    ])
  })
})

describe('Tempo mínimo', () => {
  it('sugere leitura a 200 palavras por minuto mais o vídeo', () => {
    const texto = Array.from({ length: 400 }, () => 'palavra').join(' ')
    expect(contarPalavras(texto)).toBe(400)
    expect(tempoSugeridoSeg(texto, 0)).toBe(120)
    expect(tempoSugeridoSeg(texto, 3)).toBe(300)
  })

  it('respeita piso de 30 s e teto de 4 h', () => {
    expect(tempoSugeridoSeg('', 0)).toBe(30)
    expect(limitarTempo(10)).toBe(30)
    expect(limitarTempo(99999)).toBe(14400)
  })

  it('conta o tempo restante e formata', () => {
    expect(segundosRestantes(0, 45_000, 60)).toBe(15)
    expect(segundosRestantes(0, 90_000, 60)).toBe(0)
    expect(formatarDuracao(90)).toBe('1 min 30 s')
    expect(formatarDuracao(120)).toBe('2 min')
    expect(formatarDuracao(3900)).toBe('1h 05min')
  })

  it('zera ao ocultar a aba ou perder o foco para fora, mas não ao clicar num vídeo da página', () => {
    expect(saiuDaTela({ tipo: 'visibilidade', oculto: true })).toBe(true)
    expect(saiuDaTela({ tipo: 'visibilidade', oculto: false })).toBe(false)
    expect(saiuDaTela({ tipo: 'blur', focoEmIframeDaPagina: false })).toBe(true)
    expect(saiuDaTela({ tipo: 'blur', focoEmIframeDaPagina: true })).toBe(false)
  })
})

describe('Painel de progresso', () => {
  it('agrupa por unidade e pessoa e conta só manuais ativos', () => {
    const itens = [item('a', 1, ''), item('b', 2, 'a'), item('x', 3, '', { ativo: false })]
    const base = { unidadeId: 'u1', unidadeNome: 'Centro', reinicios: 1 }
    const resumo = resumirProgresso(itens, [
      { ...base, uid: 'p1', nome: 'Ana', documentoId: 'a', status: 'concluido', concluidoMs: 10 },
      { ...base, uid: 'p1', nome: 'Ana', documentoId: 'b', status: 'concluido', concluidoMs: 20 },
      { ...base, uid: 'p1', nome: 'Ana', documentoId: 'x', status: 'concluido', concluidoMs: 30 },
      { ...base, uid: 'p2', nome: 'Bia', documentoId: 'a', status: 'em_andamento' },
    ])
    expect(resumo).toHaveLength(1)
    expect(resumo[0].pessoas.map((p) => [p.nome, p.concluidos, p.ultimoConcluido])).toEqual([
      ['Ana', 2, 'Manual b'],
      ['Bia', 0, ''],
    ])
    expect(resumo[0].percentual).toBe(50)
  })
})

describe('Biblioteca: tipos por pasta e checklist interativo', () => {
  it('checklist interativo não aparece como manual', () => {
    const tipo = tipoExibicao({ tipo: 'html', formato: 'html', titulo: 'Checklist de abertura' })
    expect(tipo).toBe('checklist_interativo')
    expect(rotuloExibicao(tipo)).toBe('Checklist interativo')
    expect(seloExibicao(tipo)).toBe('CHK')
    expect(tipoExibicao({ tipo: 'checklist', formato: 'html', titulo: 'Fechamento' })).toBe('checklist_interativo')
    const caixas = '<input type="checkbox"><input type="checkbox"><input type=checkbox>'
    expect(tipoExibicao({ tipo: 'manual', formato: 'html', titulo: 'Rotina', htmlConteudo: caixas })).toBe('checklist_interativo')
    expect(seloExibicao(tipoExibicao({ tipo: 'html', formato: 'html', titulo: 'Manual da loja' }))).toBe('INT')
  })

  it('filtros mostram só os tipos da pasta, na ordem fixa', () => {
    expect(
      tiposPresentes([
        { tipo: 'politica' },
        { tipo: 'pop' },
        { tipo: 'html', formato: 'html', titulo: 'Checklist diário' },
        { tipo: 'pop' },
      ]),
    ).toEqual(['pop', 'politica', 'checklist_interativo'])
  })
})

describe('Consulta e tempo ativo', () => {
  it('soma os segundos inteiros da sessão em andamento', () => {
    expect(segundosAtivosAgora(20, 0, 2500)).toBe(22)
    expect(segundosAtivosAgora(20, null, 2500)).toBe(20)
    expect(segundosAtivosAgora(20, 3000, 2500)).toBe(20)
    expect(restanteAtivo(30, 20, 0, 2500)).toBe(8)
    expect(restanteAtivo(30, 31, null, 2500)).toBe(0)
  })

  it('identifica o primeiro manual pendente na cadeia', () => {
    const itens = [item('a', 1, ''), item('b', 2, 'a'), item('c', 3, 'b')]
    expect(proximoPassoDaTrilha('c', itens, [])).toBe(itens[0])
    expect(proximoPassoDaTrilha('c', itens, [{ documentoId: 'a', status: 'concluido' }])).toBe(itens[1])
    expect(proximoPassoDaTrilha('a', itens, [])).toBeNull()
    expect(proximoPassoDaTrilha('c', [{ ...itens[0], anteriorId: 'c' }, ...itens.slice(1)], [])).toBeNull()
  })

  it('salva uma alteração apenas na consulta livre', () => {
    const antes = item('a', 1, '')
    const depois = { ...antes, consultaLivre: true }
    expect(alteracoesNaTrilha([depois], [antes])).toEqual([depois])
  })
})

it('inclui duas pessoas sem início entre três designadas e ignora ex-alunos', () => {
  const designados = ['Ana', 'Bia', 'Caio'].map((nome, i) => ({ uid: nome, nome, unidadeId: String(i % 2), unidadeNome: String(i % 2) }))
  const progresso = { ...designados[0], documentoId: 'a', status: 'concluido' as const, reinicios: 0 }
  const pessoas = resumirProgresso([item('a', 1, '')], [progresso, { ...progresso, uid: 'ex' }], designados).flatMap((u) => u.pessoas)
  expect(pessoas.map((p) => p.situacao).sort()).toEqual(['Concluiu', 'Não iniciou', 'Não iniciou'])
})
