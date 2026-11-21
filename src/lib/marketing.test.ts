import { describe, expect, it } from 'vitest'
import {
  acaoDaUnidade,
  campanhasDoMes,
  categoriasDe,
  contarPorStatus,
  dataDoInput,
  fazMarketing,
  filtrarMateriais,
  inputDaData,
  linkHttpsValido,
  mesclarMateriais,
  podeGerirMarketing,
  proximasCampanhas,
  proximosStatusGestor,
  situacaoCampanha,
  validarMaterial,
  validarPedido,
  vigencia,
  type CampanhaMkt,
  type MaterialForm,
  type MaterialMkt,
} from './marketing'

const DIA = 86_400_000
const agora = new Date(2026, 10, 19, 12).getTime()

function material(extra: Partial<MaterialMkt> = {}): MaterialMkt {
  return {
    id: 'm1', titulo: 'Post Black Friday', descricao: 'Arte do feed', tipo: 'arte', categoria: 'Redes sociais', campanhaId: '',
    url: 'https://drive.google.com/file/d/1', previaUrl: '', formato: 'PNG', regrasUso: '', validoDeMs: null, validoAteMs: null,
    publico: true, unidades: [], ativo: true, geradoPorIA: false, iaModelo: '', atualizadoPorNome: 'Gestora', atualizadoEmMs: 1, ...extra,
  }
}
function campanha(extra: Partial<CampanhaMkt> = {}): CampanhaMkt {
  return { id: 'c1', titulo: 'Natal', descricao: '', tipo: 'data_comemorativa', inicioMs: agora, fimMs: agora, ativo: true, geradoPorIA: false, iaModelo: '', ...extra } as CampanhaMkt
}
const formBase: MaterialForm = {
  titulo: 'Logo', descricao: '', tipo: 'logo', categoria: '', campanhaId: '', url: 'https://drive.google.com/x', previaUrl: '', formato: '', regrasUso: '',
  validoDe: '', validoAte: '', publico: true, unidades: [], ativo: true, geradoPorIA: false, iaModelo: '',
}

describe('vigência dos materiais', () => {
  it('sem datas é vigente; antes do início é futuro; o último dia ainda vale', () => {
    expect(vigencia({ validoDeMs: null, validoAteMs: null }, agora)).toBe('vigente')
    expect(vigencia({ validoDeMs: agora + DIA, validoAteMs: null }, agora)).toBe('futuro')
    const hojeMeiaNoite = new Date(2026, 10, 19).getTime()
    expect(vigencia({ validoDeMs: null, validoAteMs: hojeMeiaNoite }, agora)).toBe('vigente')
    expect(vigencia({ validoDeMs: null, validoAteMs: hojeMeiaNoite - DIA }, agora)).toBe('vencido')
  })

  it('a unidade só vê ativos e vigentes; a gestão vê tudo', () => {
    const lista = [
      material({ id: 'a' }),
      material({ id: 'b', ativo: false }),
      material({ id: 'c', validoAteMs: agora - 3 * DIA }),
      material({ id: 'd', validoDeMs: agora + 3 * DIA }),
    ]
    expect(filtrarMateriais(lista, {}, agora).map((m) => m.id)).toEqual(['a'])
    expect(filtrarMateriais(lista, { incluirForaDaVigencia: true }, agora)).toHaveLength(4)
  })

  it('filtra vigência na gestão sem ampliar a visibilidade da unidade', () => {
    const lista = [material({ id: 'a' }), material({ id: 'b', validoAteMs: agora - 3 * DIA })]
    expect(filtrarMateriais(lista, { incluirForaDaVigencia: true, vigencia: 'vencido' }, agora).map((m) => m.id)).toEqual(['b'])
    expect(filtrarMateriais(lista, { vigencia: 'vencido' }, agora)).toEqual([])
  })

  it('filtra por tipo, categoria, campanha e busca sem acento', () => {
    const lista = [material({ id: 'a', titulo: 'Promoção de Verão', campanhaId: 'c1' }), material({ id: 'b', tipo: 'logo', categoria: 'Marca' })]
    expect(filtrarMateriais(lista, { busca: 'promocao' }, agora).map((m) => m.id)).toEqual(['a'])
    expect(filtrarMateriais(lista, { tipo: 'logo' }, agora).map((m) => m.id)).toEqual(['b'])
    expect(filtrarMateriais(lista, { categoria: 'Marca' }, agora).map((m) => m.id)).toEqual(['b'])
    expect(filtrarMateriais(lista, { campanhaId: 'c1' }, agora).map((m) => m.id)).toEqual(['a'])
  })

  it('mescla as consultas da rede e da unidade sem duplicar e lista categorias', () => {
    expect(mesclarMateriais([material({ id: 'a' })], [material({ id: 'a' }), material({ id: 'b' })]).map((m) => m.id).sort()).toEqual(['a', 'b'])
    expect(categoriasDe([{ categoria: 'B' }, { categoria: 'A' }, { categoria: '' }, { categoria: 'A' }])).toEqual(['A', 'B'])
  })
})

describe('links', () => {
  it('aceita só https sem espaços', () => {
    expect(linkHttpsValido('https://drive.google.com/a')).toBe(true)
    expect(linkHttpsValido('http://site.com')).toBe(false)
    expect(linkHttpsValido('javascript:alert(1)')).toBe(false)
    expect(linkHttpsValido('https://a b')).toBe(false)
    expect(linkHttpsValido(`https://a.com/${'x'.repeat(600)}`)).toBe(false)
  })
})

describe('calendário', () => {
  it('campanhas do mês incluem as que atravessam o mês', () => {
    const lista = [
      campanha({ id: 'nov', inicioMs: new Date(2026, 10, 25).getTime(), fimMs: new Date(2026, 11, 2).getTime() }),
      campanha({ id: 'dez', inicioMs: new Date(2026, 11, 24).getTime(), fimMs: new Date(2026, 11, 25).getTime() }),
      campanha({ id: 'out', inicioMs: new Date(2026, 9, 1).getTime(), fimMs: new Date(2026, 9, 31).getTime() }),
    ]
    expect(campanhasDoMes(lista, 2026, 11).map((c) => c.id)).toEqual(['nov', 'dez'])
    expect(campanhasDoMes(lista, 2026, 10).map((c) => c.id)).toEqual(['nov'])
  })

  it('próximas campanhas ignoram inativas, encerradas e as muito distantes', () => {
    const lista = [
      campanha({ id: 'ok', inicioMs: agora + 10 * DIA, fimMs: agora + 12 * DIA }),
      campanha({ id: 'longe', inicioMs: agora + 90 * DIA, fimMs: agora + 91 * DIA }),
      campanha({ id: 'inativa', ativo: false, inicioMs: agora, fimMs: agora }),
      campanha({ id: 'passada', inicioMs: agora - 10 * DIA, fimMs: agora - 5 * DIA }),
    ]
    expect(proximasCampanhas(lista, agora).map((c) => c.id)).toEqual(['ok'])
    expect(situacaoCampanha({ inicioMs: agora + DIA, fimMs: agora + 2 * DIA }, agora)).toBe('em_breve')
    expect(situacaoCampanha({ inicioMs: agora - DIA, fimMs: agora }, agora)).toBe('em_andamento')
    expect(situacaoCampanha({ inicioMs: agora - 5 * DIA, fimMs: agora - 2 * DIA }, agora)).toBe('encerrada')
  })
})

describe('validações', () => {
  it('material exige link https, unidades quando direcionado e o modelo de IA', () => {
    expect(validarMaterial(formBase)).toEqual([])
    expect(validarMaterial({ ...formBase, url: 'http://x' })).toHaveLength(1)
    expect(validarMaterial({ ...formBase, publico: false })).toHaveLength(1)
    expect(validarMaterial({ ...formBase, publico: false, unidades: Array.from({ length: 31 }, (_, i) => `u${i}`) })).toHaveLength(1)
    expect(validarMaterial({ ...formBase, geradoPorIA: true })).toHaveLength(1)
    expect(validarMaterial({ ...formBase, geradoPorIA: true, iaModelo: 'Grok Imagine' })).toEqual([])
    expect(validarMaterial({ ...formBase, validoDe: '2026-12-10', validoAte: '2026-12-01' })).toHaveLength(1)
  })

  it('pedido exige título, descrição e referência https', () => {
    const p = { titulo: 'Post', tipoPeca: 'post' as const, descricao: 'Post de inauguração', medidas: '', prazoDesejado: '', referenciaUrl: '', campanhaId: '' }
    expect(validarPedido(p)).toEqual([])
    expect(validarPedido({ ...p, descricao: 'curta' })).toHaveLength(1)
    expect(validarPedido({ ...p, referenciaUrl: 'ftp://x' })).toHaveLength(1)
  })
})

describe('fluxo dos pedidos', () => {
  it('a franqueadora não reabre pedidos fechados e a unidade só cancela ou responde', () => {
    expect(proximosStatusGestor('aberta')).toEqual(['em_producao', 'aguardando_unidade', 'entregue', 'cancelada'])
    expect(proximosStatusGestor('em_producao')).not.toContain('em_producao')
    expect(proximosStatusGestor('entregue')).toEqual([])
    expect(proximosStatusGestor('cancelada')).toEqual([])
    expect(acaoDaUnidade('aberta')).toBe('cancelar')
    expect(acaoDaUnidade('aguardando_unidade')).toBe('responder')
    expect(acaoDaUnidade('em_producao')).toBeNull()
    expect(contarPorStatus([{ status: 'aberta' }, { status: 'aberta' }, { status: 'entregue' }])).toMatchObject({ aberta: 2, entregue: 1, cancelada: 0 })
  })
})

describe('papéis e datas', () => {
  it('gestão só para admin ou equipe da franqueadora com marketing', () => {
    expect(podeGerirMarketing({ papel: 'franqueado', modulosLiberados: ['marketing'] }, false)).toBe(false)
    expect(podeGerirMarketing({ papel: 'equipe_franqueadora', modulosLiberados: ['marketing'] }, false)).toBe(true)
    expect(podeGerirMarketing({ papel: 'equipe_franqueadora', modulosLiberados: [] }, false)).toBe(false)
    expect(podeGerirMarketing({ papel: 'equipe_franqueadora', ativo: false, modulosLiberados: ['marketing'] }, false)).toBe(false)
    expect(podeGerirMarketing({ papel: 'admin' }, true)).toBe(true)
    expect(fazMarketing({ papel: 'equipe_franqueado' })).toBe(true)
    expect(fazMarketing({ papel: 'equipe_franqueadora' })).toBe(false)
  })

  it('converte a data do input em data local e volta', () => {
    const d = dataDoInput('2026-12-25')
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(11)
    expect(d?.getDate()).toBe(25)
    expect(dataDoInput('')).toBeNull()
    expect(inputDaData(d!.getTime())).toBe('2026-12-25')
    expect(inputDaData(null)).toBe('')
  })
})
