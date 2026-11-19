import { describe, expect, it } from 'vitest'
import {
  atingiuNota,
  aulasConcluidas,
  contarAcertos,
  estadoDaProva,
  idReestudo,
  idTentativa,
  limitarReestudo,
  mensagemResultado,
  podeGerirUniversidade,
  fazUniversidade,
  resumirResultados,
  separarGabarito,
  slugCurso,
  validarProva,
  type TentativaProva,
} from './universidade'

const t = (ciclo: number, numero: number, aprovado: boolean | null, extra: Partial<TentativaProva> = {}): TentativaProva => ({
  id: idTentativa('u1', 'c1', ciclo, numero),
  uid: 'u1',
  cursoId: 'c1',
  ciclo,
  numero,
  nome: 'Ana',
  unidadeId: 'un-1',
  unidadeNome: 'Centro',
  versao: 1,
  aprovado,
  ...extra,
})

describe('estadoDaProva', () => {
  it('começa com 3 chances no ciclo 1', () => {
    expect(estadoDaProva('c1', [], [])).toEqual({ tipo: 'disponivel', ciclo: 1, numero: 1, restantes: 3 })
  })
  it('conta as chances restantes', () => {
    expect(estadoDaProva('c1', [t(1, 1, false)], [])).toMatchObject({ tipo: 'disponivel', numero: 2, restantes: 2 })
    expect(estadoDaProva('c1', [t(1, 1, false), t(1, 2, false)], [])).toMatchObject({ numero: 3, restantes: 1 })
  })
  it('depois de 3 reprovações exige reestudo', () => {
    const tres = [t(1, 1, false), t(1, 2, false), t(1, 3, false)]
    expect(estadoDaProva('c1', tres, [])).toMatchObject({ tipo: 'reestudo', ciclo: 1, reestudo: null })
    const emAndamento = [{ id: idReestudo('u1', 'c1', 1), cursoId: 'c1', ciclo: 1, status: 'em_andamento' as const }]
    expect(estadoDaProva('c1', tres, emAndamento)).toMatchObject({ tipo: 'reestudo' })
  })
  it('reestudo concluído abre um ciclo novo', () => {
    const tres = [t(1, 1, false), t(1, 2, false), t(1, 3, false)]
    const feito = [{ id: 'x', cursoId: 'c1', ciclo: 1, status: 'concluido' as const }]
    expect(estadoDaProva('c1', tres, feito)).toEqual({ tipo: 'disponivel', ciclo: 2, numero: 1, restantes: 3 })
  })
  it('aprovado vence e pendente pede correção', () => {
    expect(estadoDaProva('c1', [t(1, 1, false), t(1, 2, true)], []).tipo).toBe('aprovado')
    expect(estadoDaProva('c1', [t(1, 1, null)], []).tipo).toBe('corrigindo')
  })
  it('ignora outros cursos', () => {
    expect(estadoDaProva('c2', [t(1, 1, false)], []).tipo).toBe('disponivel')
  })
})

describe('nota', () => {
  it('conta acertos e aplica a mesma regra das rules', () => {
    expect(contarAcertos([1, 0, 3, 0], [1, 0, 3, 1])).toBe(3)
    expect(atingiuNota(3, 4, 75)).toBe(true)
    expect(atingiuNota(2, 4, 75)).toBe(false)
    expect(atingiuNota(0, 0, 1)).toBe(false)
  })
  it('mensagem nunca traz a resposta certa', () => {
    expect(mensagemResultado(false, 2)).toMatch(/Restam 2 chances/)
    expect(mensagemResultado(false, 1)).toMatch(/Resta 1 chance/)
    expect(mensagemResultado(false, 0)).toMatch(/reestudo/)
    expect(mensagemResultado(true, 0)).toMatch(/Aprovado/)
    expect(mensagemResultado(false, 2, true)).toMatch(/atualizou esta prova/)
    expect(mensagemResultado(false, 0, true)).toMatch(/reestudo/)
  })
})

describe('edição da prova', () => {
  const base = { titulo: 'Prova', notaMinima: 70, manualRetornoId: 'm1', perguntas: [{ id: 'p1', enunciado: 'Q', opcoes: ['a', 'b'], correta: 1 }] }
  it('aceita prova válida', () => {
    expect(validarProva(base)).toEqual([])
  })
  it('recusa sem correta, nota fora e sem manual de retorno', () => {
    expect(validarProva({ ...base, perguntas: [{ ...base.perguntas[0], correta: -1 }] }).join()).toMatch(/correta/)
    expect(validarProva({ ...base, notaMinima: 101 }).join()).toMatch(/1 a 100/)
    expect(validarProva({ ...base, manualRetornoId: '' }).join()).toMatch(/manual/)
  })
  it('separa o gabarito da pergunta pública', () => {
    const { publicas, corretas } = separarGabarito(base.perguntas)
    expect(corretas).toEqual([1])
    expect(Object.keys(publicas[0]).sort()).toEqual(['enunciado', 'id', 'opcoes'])
  })
  it('slug e tempo de reestudo', () => {
    expect(slugCurso('Atendimento ao Cliente — Nível 1')).toBe('atendimento-ao-cliente-nivel-1')
    expect(slugCurso('!!!')).toBe('curso')
    expect(limitarReestudo(5)).toBe(30)
    expect(limitarReestudo(99999)).toBe(14400)
  })
})

describe('resultados e acesso', () => {
  it('agrupa por unidade e pessoa, com nota só quando há gabarito', () => {
    const lista = [t(1, 1, false), t(1, 2, true)]
    const folhas = new Map([[lista[0].id, [0, 0]], [lista[1].id, [0, 1]]])
    const semNota = resumirResultados(lista, null)
    expect(semNota[0].pessoas[0].cursos[0]).toMatchObject({ aprovado: true, tentativas: 2, melhorNota: null })
    // Franqueado: tem as tentativas, mas não o gabarito nem as folhas.
    expect(resumirResultados(lista, new Map([['c1', [0, 1]]]), null)[0].pessoas[0].cursos[0].melhorNota).toBeNull()
    const comNota = resumirResultados(lista, new Map([['c1', [0, 1]]]), folhas)
    expect(comNota[0].pessoas[0].cursos[0].melhorNota).toBe(100)
    const reprovado = resumirResultados([t(1, 1, false), t(1, 2, false), t(1, 3, false)], null)
    expect(reprovado[0].pessoas[0].cursos[0].aguardandoReestudo).toBe(true)
  })
  it('aulas concluídas vêm do progresso de manuais', () => {
    expect(aulasConcluidas({ aulas: ['a', 'b', 'c'] }, [{ documentoId: 'a', status: 'concluido' }, { documentoId: 'b', status: 'em_andamento' }])).toBe(1)
  })
  it('quem gere e quem faz', () => {
    expect(podeGerirUniversidade({ papel: 'equipe_franqueadora', modulosLiberados: ['universidade'] }, false)).toBe(true)
    expect(podeGerirUniversidade({ papel: 'equipe_franqueadora', modulosLiberados: ['manuais'] }, false)).toBe(false)
    expect(podeGerirUniversidade({ papel: 'franqueado', modulosLiberados: ['universidade'] }, false)).toBe(false)
    expect(podeGerirUniversidade({ papel: 'admin' }, true)).toBe(true)
    expect(fazUniversidade({ papel: 'equipe_franqueado' })).toBe(true)
    expect(fazUniversidade({ papel: 'admin' })).toBe(false)
  })
})
