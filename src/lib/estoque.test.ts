import { describe, expect, it } from 'vitest'
import {
  acoesPedido,
  alertas,
  centavosDe,
  deltaDe,
  linhasContagem,
  linhasDigitadas,
  camposContagem,
  criarFilaContagem,
  situacaoSaldo,
  nivelEstoque,
  podeGerirEstoque,
  recalcularContagem,
  resumoRede,
  saldos,
  sugestaoReposicao,
  tabelaSaldos,
  validarContagem,
  validarItem,
  validarMovimento,
  validarPedido,
  type ItemEstoque,
  type Movimento,
} from './estoque'

const item = (id: string, minimo: number, ativo = true): ItemEstoque => ({
  id, nome: `Item ${id}`, codigo: '', categoria: 'insumos', unidadeMedida: 'un', estoqueMinimo: minimo, precoSugeridoCentavos: 0,
  descricao: '', ativo, geradoPorIA: false, iaModelo: '', atualizadoPorNome: '', atualizadoEmMs: 0,
})
const mov = (itemId: string, delta: number, unidadeId = 'u1', criadoEmMs = 1): Movimento => ({
  id: `${itemId}${delta}${criadoEmMs}`, unidadeId, unidadeNome: unidadeId.toUpperCase(), itemId, itemNome: itemId, unidadeMedida: 'un',
  tipo: delta >= 0 ? 'entrada' : 'saida', quantidade: Math.abs(delta), delta, motivo: '', origem: 'manual', origemId: '', indice: 0, uid: 'x', nome: 'X', criadoEmMs,
})

describe('saldo e alertas', () => {
  it('soma os deltas por item', () => {
    const s = saldos([mov('a', 10), mov('a', -3), mov('b', 5)])
    expect(s.get('a')).toBe(7)
    expect(s.get('b')).toBe(5)
  })
  it('classifica pelo mínimo', () => {
    expect(nivelEstoque(0, 5)).toBe('zerado')
    expect(nivelEstoque(-2, 0)).toBe('zerado')
    expect(nivelEstoque(4, 5)).toBe('baixo')
    expect(nivelEstoque(5, 5)).toBe('ok')
  })
  it('lista críticos primeiro e esconde inativos sem saldo', () => {
    const linhas = tabelaSaldos([item('a', 5), item('b', 2), item('c', 1, false), item('d', 1, false)], [mov('a', 3), mov('b', 9), mov('c', 2)])
    expect(linhas.map((l) => l.item.id)).toEqual(['a', 'b', 'c'])
    expect(alertas(linhas).map((l) => l.item.id)).toEqual(['a'])
  })
  it('sugere repor até o dobro do mínimo', () => {
    const linhas = tabelaSaldos([item('a', 5), item('b', 4)], [mov('a', 3)])
    expect(sugestaoReposicao(linhas)).toEqual([{ itemId: 'b', quantidade: 8 }, { itemId: 'a', quantidade: 7 }])
  })
})

describe('movimentos', () => {
  it('sinal do delta', () => {
    expect(deltaDe('entrada', 4)).toBe(4)
    expect(deltaDe('saida', 4)).toBe(-4)
    expect(deltaDe('venda', 4)).toBe(-4)
    expect(deltaDe('ajuste', -4)).toBe(-4)
  })
  it('valida quantidade, motivo e saldo', () => {
    expect(validarMovimento('entrada', 3, '', 0)).toEqual([])
    expect(validarMovimento('entrada', 0, '', 0)).toHaveLength(1)
    expect(validarMovimento('entrada', 1.5, '', 0)).toHaveLength(1)
    expect(validarMovimento('saida', 2, '', 10)).toHaveLength(1)
    expect(validarMovimento('venda', 11, '', 10)).toHaveLength(1)
    expect(validarMovimento('saida', 2, 'uso', 10)).toEqual([])
  })
})

describe('contagem', () => {
  it('diferença = contado − sistema, só do que foi contado', () => {
    const linhas = linhasContagem([item('a', 1), item('b', 1)], new Map([['a', 10]]), { a: 8 })
    expect(linhas).toEqual([{ itemId: 'a', itemNome: 'Item a', unidadeMedida: 'un', sistema: 10, contado: 8, diferenca: -2 }])
  })
  it('recalcula com o saldo do momento da confirmação', () => {
    const linhas = linhasContagem([item('a', 1)], new Map([['a', 10]]), { a: 8 })
    expect(recalcularContagem(linhas, new Map([['a', 12]]))[0].diferenca).toBe(-4)
  })
  it('valida', () => {
    expect(validarContagem([])).toHaveLength(1)
    expect(validarContagem(linhasContagem([item('a', 1)], new Map(), { a: -1 }))).toHaveLength(1)
    expect(validarContagem(linhasContagem([item('a', 1)], new Map([['a', -2]]), { a: 3 }))).toHaveLength(1)
  })
})

describe('pedido, catálogo e acesso', () => {
  it('ações por lado', () => {
    expect(acoesPedido('aberto', 'unidade')).toEqual(['cancelado'])
    expect(acoesPedido('enviado', 'unidade')).toEqual(['recebido'])
    expect(acoesPedido('aprovado', 'unidade')).toEqual([])
    expect(acoesPedido('aprovado', 'rede')).toEqual(['enviado', 'cancelado'])
    expect(acoesPedido('recebido', 'rede')).toEqual([])
  })
  it('valida pedido', () => {
    expect(validarPedido([])).toHaveLength(1)
    expect(validarPedido([{ quantidade: 0 }])).toHaveLength(1)
    expect(validarPedido([{ quantidade: 3 }])).toEqual([])
  })
  it('preço em centavos', () => {
    expect(centavosDe('12,90')).toBe(1290)
    expect(centavosDe('R$ 1.234,5')).toBe(123450)
    expect(centavosDe('')).toBe(0)
    expect(centavosDe('abc')).toBeNull()
  })
  it('item exige modelo de IA quando marcado', () => {
    const base = { nome: 'Cadeado 40mm', codigo: '', categoria: 'cadeados' as const, unidadeMedida: 'un' as const, estoqueMinimo: 10, preco: '39,90', descricao: '', ativo: true, geradoPorIA: false, iaModelo: '' }
    expect(validarItem(base)).toEqual([])
    expect(validarItem({ ...base, geradoPorIA: true })).toHaveLength(1)
  })
  it('quem gere', () => {
    expect(podeGerirEstoque({ papel: 'admin' }, true)).toBe(true)
    expect(podeGerirEstoque({ papel: 'equipe_franqueadora', modulosLiberados: ['estoque'] }, false)).toBe(true)
    expect(podeGerirEstoque({ papel: 'equipe_franqueadora', modulosLiberados: ['checklist'] }, false)).toBe(false)
    expect(podeGerirEstoque({ papel: 'franqueado', modulosLiberados: ['estoque'] }, false)).toBe(false)
  })
  it('resumo da rede por unidade', () => {
    const r = resumoRede([item('a', 5), item('b', 1)], [mov('a', 2, 'u1', 5), mov('b', 3, 'u1', 9), mov('a', 9, 'u2'), mov('b', 1, 'u2')], [], [])
    expect(r[0]).toMatchObject({ unidadeId: 'u1', itensBaixos: 1, itensZerados: 0, ultimoMovimentoMs: 9 })
    expect(r[1]).toMatchObject({ unidadeId: 'u2', itensBaixos: 0, itensZerados: 0 })
  })
})

it('inclui unidade sem lançamento e distingue zero confirmado de item nunca lançado', () => {
  const itens = [item('a', 5), item('b', 3)]
  const zero = linhasContagem(itens, new Map(), { a: 0 })
  expect(resumoRede(itens, [], [], [], [{ id: 'u', nome: 'Centro' }])[0]).toMatchObject({ situacao: 'Sem lançamento', itensZerados: 0, itensBaixos: 0 })
  expect(tabelaSaldos(itens, [], zero).map(situacaoSaldo)).toEqual(['Saldo zero', 'Sem lançamento'])
})

it('restaura 5, zero e vazio e exclui o vazio ao recalcular diferenças', () => {
  const linhas = linhasDigitadas([item('a', 1), item('b', 1), item('c', 1)], new Map([['a', 3], ['b', 2]]), { a: '5', b: '0', c: '' })
  expect(camposContagem(linhas)).toEqual({ a: '5', b: '0', c: '' })
  expect(recalcularContagem(linhas, new Map([['a', 3], ['b', 2]])).map((l) => [l.contado, l.sistema, l.diferenca])).toEqual([[5, 3, 2], [0, 2, -2]])
})

it('serializa o salvamento e reutiliza o id aberto após a primeira gravação', async () => {
  const ids: (string | null)[] = []
  let liberar!: () => void
  const primeira = new Promise<void>((resolve) => { liberar = resolve })
  const fila = criarFilaContagem(null, async (id) => {
    ids.push(id)
    if (!id) await primeira
    return id ?? 'aberta'
  })
  const [zero] = linhasDigitadas([item('a', 1)], new Map(), { a: '0' })
  const a = fila.salvar({ itens: [zero], obs: '' })
  const b = fila.salvar({ itens: [{ ...zero, contado: null }], obs: '' })
  await Promise.resolve()
  expect(ids).toEqual([null])
  liberar()
  await expect(Promise.all([a, b])).resolves.toEqual(['aberta', 'aberta'])
  expect(ids).toEqual([null, 'aberta'])
})
