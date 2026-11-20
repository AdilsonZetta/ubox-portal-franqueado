import { describe, expect, it } from 'vitest'
import {
  agruparPorPasta,
  filtrarLinks,
  formVazio,
  juntarLinks,
  normalizarTags,
  papelNuvem,
  recentes,
  tagsDoCampo,
  tagsParaCampo,
  tipoDoLink,
  todasAsTags,
  urlDriveValida,
  validarLink,
  type LinkForm,
  type LinkNuvem,
} from './nuvem'
import type { Usuario } from '../types'

const link = (id: string, extra: Partial<LinkNuvem> = {}): LinkNuvem => ({
  id, titulo: `Título ${id}`, descricao: '', url: 'https://drive.google.com/file/d/x', pasta: 'Contratos', tags: [], visibilidade: 'privada', unidades: [], dono: 'un-1',
  geradoPorIA: false, iaModelo: '', criadoPorNome: 'Ana', criadoEmMs: 1, atualizadoPorNome: 'Ana', atualizadoEmMs: 1, ...extra,
})
const form = (extra: Partial<LinkForm> = {}): LinkForm => ({ ...formVazio('unidade'), titulo: 'Contrato padrão', url: 'https://docs.google.com/document/d/x/edit', pasta: 'Contratos', ...extra })
const pessoa = (extra: Partial<Usuario>): Usuario => ({ uid: 'u', email: 'u@x', nome: 'U', papel: 'franqueado', ativo: true, recusado: false, unidade: 'Un', cidade: 'C', unidadeId: 'un-1', modulosLiberados: ['nuvem'], ...extra })

describe('módulo 13: armazenamento em nuvem', () => {
  it('aceita só https do Google Drive/Docs, como as regras', () => {
    expect(urlDriveValida('https://drive.google.com/drive/folders/abc')).toBe(true)
    expect(urlDriveValida('https://docs.google.com/spreadsheets/d/abc/edit#gid=0')).toBe(true)
    expect(urlDriveValida('http://drive.google.com/x')).toBe(false)
    expect(urlDriveValida('https://drive.google.com.evil.io/x')).toBe(false)
    expect(urlDriveValida('https://evil.io/?u=https://drive.google.com/x')).toBe(false)
    expect(urlDriveValida('https://dropbox.com/s/x')).toBe(false)
    expect(urlDriveValida('https://drive.google.com/a b')).toBe(false)
    expect(urlDriveValida(`https://drive.google.com/${'x'.repeat(600)}`)).toBe(false)
  })

  it('reconhece o tipo do arquivo pelo link', () => {
    expect(tipoDoLink('https://drive.google.com/drive/folders/abc')).toBe('pasta')
    expect(tipoDoLink('https://drive.google.com/drive/u/0/folders/abc')).toBe('pasta')
    expect(tipoDoLink('https://docs.google.com/document/d/x')).toBe('documento')
    expect(tipoDoLink('https://docs.google.com/spreadsheets/d/x')).toBe('planilha')
    expect(tipoDoLink('https://docs.google.com/presentation/d/x')).toBe('apresentacao')
    expect(tipoDoLink('https://docs.google.com/forms/d/x')).toBe('formulario')
    expect(tipoDoLink('https://drive.google.com/file/d/x')).toBe('arquivo')
  })

  it('normaliza etiquetas no formato que as regras aceitam', () => {
    const tags = normalizarTags(' Contrato, modelo ,contrato,, Fotos  da   loja ')
    expect(tags).toEqual(['contrato', 'modelo', 'fotos da loja'])
    expect(normalizarTags(Array.from({ length: 15 }, (_, i) => `t${i}`).join(','))).toHaveLength(10)
    expect(normalizarTags('x'.repeat(40))[0]).toHaveLength(30)
    const campo = tagsParaCampo(tags)
    expect(campo).toMatch(/^([^,]{1,30}(,[^,]{1,30}){0,9})?$/)
    expect(tagsDoCampo(campo)).toEqual(tags)
    expect(tagsDoCampo('')).toEqual([])
  })

  it('define o papel no módulo', () => {
    expect(papelNuvem(pessoa({}))).toBe('unidade')
    expect(papelNuvem(pessoa({ papel: 'equipe_franqueado' }))).toBe('unidade')
    expect(papelNuvem(pessoa({ modulosLiberados: ['manuais'] }))).toBeNull()
    expect(papelNuvem(pessoa({ unidadeId: null }))).toBeNull()
    expect(papelNuvem(pessoa({ papel: 'admin', modulosLiberados: [] }))).toBe('rede')
    expect(papelNuvem(pessoa({ papel: 'equipe_franqueadora', modulosLiberados: ['nuvem-rede'] }))).toBe('rede')
    expect(papelNuvem(pessoa({ papel: 'equipe_franqueadora', modulosLiberados: ['nuvem'] }))).toBeNull()
    expect(papelNuvem(pessoa({ ativo: false }))).toBeNull()
    expect(papelNuvem(null)).toBeNull()
  })

  it('valida o formulário', () => {
    expect(validarLink(form(), 'unidade')).toEqual([])
    expect(validarLink(form({ titulo: 'x' }), 'unidade')).toHaveLength(1)
    expect(validarLink(form({ url: 'https://dropbox.com/x' }), 'unidade')).toHaveLength(1)
    expect(validarLink(form({ pasta: '' }), 'unidade')).toHaveLength(1)
    expect(validarLink(form({ pasta: 'a/b' }), 'unidade')).toHaveLength(1)
    expect(validarLink(form({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') }), 'unidade')).toHaveLength(1)
    expect(validarLink(form({ geradoPorIA: true, iaModelo: '' }), 'unidade')).toHaveLength(1)
    expect(validarLink(form({ geradoPorIA: true, iaModelo: 'Grok Bot' }), 'unidade')).toEqual([])
    expect(validarLink(form({ visibilidade: 'rede' }), 'unidade')).toHaveLength(1)
    expect(validarLink(form({ visibilidade: 'privada' }), 'rede')).toHaveLength(1)
    expect(validarLink(form({ visibilidade: 'unidades', unidades: [] }), 'rede')).toHaveLength(1)
    expect(validarLink(form({ visibilidade: 'unidades', unidades: ['un-1'] }), 'rede')).toEqual([])
    expect(formVazio('rede').visibilidade).toBe('rede')
    expect(formVazio('unidade').visibilidade).toBe('privada')
  })

  it('agrupa por pasta, filtra, lista etiquetas e recentes', () => {
    const ls = [
      link('a', { pasta: 'Marketing', titulo: 'Zeta', tags: ['logo'], criadoEmMs: 3 }),
      link('b', { pasta: 'Contratos', titulo: 'Beta', descricao: 'Modelo de locação', criadoEmMs: 2 }),
      link('c', { pasta: 'Marketing', titulo: 'Alfa', tags: ['logo', 'fotos'], criadoEmMs: 5 }),
    ]
    expect(agruparPorPasta(ls).map((g) => [g.pasta, g.links.map((l) => l.titulo)])).toEqual([['Contratos', ['Beta']], ['Marketing', ['Alfa', 'Zeta']]])
    expect(filtrarLinks(ls, 'locacao', '').map((l) => l.id)).toEqual(['b'])
    expect(filtrarLinks(ls, '', 'fotos').map((l) => l.id)).toEqual(['c'])
    expect(todasAsTags(ls)).toEqual(['fotos', 'logo'])
    expect(recentes(ls, 2).map((l) => l.id)).toEqual(['c', 'a'])
    expect(juntarLinks([ls[0]], [ls[0], ls[1]]).map((l) => l.id)).toEqual(['a', 'b'])
  })
})
