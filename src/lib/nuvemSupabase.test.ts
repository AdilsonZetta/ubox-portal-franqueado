// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Usuario } from '../types'
import { formVazio } from './nuvem'
import { carregarLinksRedeSb, carregarLinksUnidadeSb, criarLinkSb, mapLinkSb, removerLinkSb, salvarLinkSb } from './nuvemSupabase'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('./supabase', () => ({ requireSupabase: () => ({ from }) }))

const linha = {
  id: 'id-firestore', titulo: 'Contrato', tags: 'contrato,modelo', dono: 'u',
  visibilidade: 'privada', pasta: 'Contratos', unidades: [],
  gerado_por_ia: true, ia_modelo: 'Grok Bot',
  criado_por_nome: 'Autora', atualizado_por_nome: 'Editor',
  criado_em: '2026-11-20T14:00:00Z', atualizado_em: '2026-11-20T15:00:00Z',
}
const autor = { unidadeId: 'u' } as Usuario
const formulario = { ...formVazio('unidade'), titulo: ' Contrato ', tags: ' Modelo, modelo, A ', geradoPorIA: true, iaModelo: ' Grok Bot ' }

const consulta = {
  select: vi.fn(), eq: vi.fn(), contains: vi.fn(), order: vi.fn(), range: vi.fn(),
  insert: vi.fn(), update: vi.fn(), delete: vi.fn(), single: vi.fn(),
}

const pagina = (data: unknown[], error: unknown = null) => ({ overrideTypes: async () => ({ data, error }) })

beforeEach(() => {
  vi.resetAllMocks()
  from.mockReturnValue(consulta)
  for (const metodo of Object.values(consulta)) metodo.mockReturnValue(consulta)
  consulta.range.mockReturnValue(pagina([]))
  consulta.single.mockResolvedValue({ data: { id: linha.id }, error: null })
})

describe('Armazenamento em Nuvem no Supabase', () => {
  it('mapeia o ID legado, as etiquetas, a autoria e os horários do Postgres', () => {
    expect(mapLinkSb(linha)).toMatchObject({
      id: linha.id, tags: ['contrato', 'modelo'], dono: 'u', visibilidade: 'privada',
      geradoPorIA: true, iaModelo: 'Grok Bot', criadoPorNome: 'Autora', atualizadoPorNome: 'Editor',
      criadoEmMs: 1795183200000, atualizadoEmMs: 1795186800000,
    })
    expect(mapLinkSb({ id: 'outro', criado_em: 'inválido' }).criadoEmMs).toBe(0)
  })

  it('pagina a lista da franqueadora com filtro de dono', async () => {
    const primeira = Array.from({ length: 500 }, (_, i) => ({ ...linha, id: `rede-${i}`, dono: '' }))
    consulta.range.mockReturnValueOnce(pagina(primeira))
      .mockReturnValueOnce(pagina([{ ...linha, id: 'final', dono: '' }]))
    const links = await carregarLinksRedeSb()
    expect(from).toHaveBeenCalledWith('nuvem_links')
    expect(consulta.eq.mock.calls).toEqual([['dono', ''], ['dono', '']])
    expect(consulta.range.mock.calls).toEqual([[0, 499], [500, 999]])
    expect(links).toHaveLength(501)
    expect(links.at(-1)?.id).toBe('final')
  })

  it('une e deduplica links da rede, direcionados e privados da unidade', async () => {
    const rede = { ...linha, id: 'rede', dono: '', visibilidade: 'rede' }
    const compartilhado = { ...linha, id: 'direcionado', dono: '', visibilidade: 'unidades', unidades: ['u'] }
    consulta.range.mockReturnValueOnce(pagina([rede]))
      .mockReturnValueOnce(pagina([rede, compartilhado]))
      .mockReturnValueOnce(pagina([linha]))
    expect((await carregarLinksUnidadeSb('u')).map(({ id }) => id)).toEqual(['rede', 'direcionado', linha.id])
    expect(consulta.eq.mock.calls).toEqual([['dono', ''], ['visibilidade', 'rede'], ['dono', ''], ['dono', 'u']])
    expect(consulta.contains).toHaveBeenCalledWith('unidades', '{"u"}')
  })

  it('cria um link privado com campos normalizados e devolve o ID gerado', async () => {
    await expect(criarLinkSb(autor, 'unidade', formulario)).resolves.toBe(linha.id)
    expect(consulta.insert).toHaveBeenCalledWith({
      titulo: 'Contrato', descricao: '', url: '', pasta: '', tags: 'modelo,a',
      visibilidade: 'privada', unidades: [], dono: 'u', gerado_por_ia: true, ia_modelo: 'Grok Bot',
    })
  })

  it('edita os dados do formulário sem reenviar o dono nem a autoria', async () => {
    await salvarLinkSb(linha.id, { ...formulario, visibilidade: 'unidades', unidades: ['u', 'u', 'v'], geradoPorIA: false })
    const [campos] = consulta.update.mock.calls[0]
    expect(campos).toMatchObject({ unidades: ['u', 'v'], gerado_por_ia: false, ia_modelo: '' })
    expect(campos).not.toHaveProperty('dono')
    expect(campos).not.toHaveProperty('atualizado_por')
    expect(consulta.eq).toHaveBeenCalledWith('id', linha.id)
  })

  it('remove o registro pelo ID e propaga erros do Supabase', async () => {
    const erro = { message: 'Permissão negada' }
    consulta.single.mockResolvedValue({ data: null, error: erro })
    await expect(removerLinkSb(linha.id)).rejects.toBe(erro)
    expect(consulta.delete).toHaveBeenCalledOnce()
    expect(consulta.eq).toHaveBeenCalledWith('id', linha.id)
  })

  it('propaga falhas de leitura', async () => {
    const erro = { message: 'Falha na consulta' }
    consulta.range.mockReturnValue(pagina([], erro))
    await expect(carregarLinksRedeSb()).rejects.toBe(erro)
  })
})
