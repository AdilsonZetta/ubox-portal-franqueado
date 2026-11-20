import { describe, expect, it } from 'vitest'
import { escolherBackend } from './backend'
import { statusDoPerfil } from './authStatus'
import { mapUsuarioSupabase, type LinhaUsuario } from './supabaseAuth'
import { resolverSupabaseConfig } from '../supabaseConfig'

const linha = (extra: Partial<LinhaUsuario> = {}): LinhaUsuario => ({
  id: '11111111-1111-1111-1111-111111111111',
  email: 'a@ubox.com.br',
  nome: 'Ana',
  papel: 'franqueado',
  ativo: true,
  recusado: false,
  unidade: 'Centro',
  cidade: null,
  unidade_id: 'un-1',
  modulos_liberados: ['manuais'],
  criado_por: null,
  criado_em: '2026-11-20T12:00:00Z',
  atualizado_em: null,
  ...extra,
})

describe('backend', () => {
  it('padrão continua Firebase', () => {
    expect(escolherBackend(undefined)).toBe('firebase')
    expect(escolherBackend('')).toBe('firebase')
    expect(escolherBackend('qualquer')).toBe('firebase')
    expect(escolherBackend(' Supabase ')).toBe('supabase')
  })
})

describe('mapUsuarioSupabase', () => {
  it('converte snake_case para o Usuario do app', () => {
    const u = mapUsuarioSupabase(linha())
    expect(u).toMatchObject({ uid: linha().id, unidadeId: 'un-1', cidade: '', modulosLiberados: ['manuais'], criadoPor: undefined })
  })
  it('rejeita papel desconhecido ou linha vazia', () => {
    expect(mapUsuarioSupabase(linha({ papel: 'root' }))).toBeNull()
    expect(mapUsuarioSupabase(null)).toBeNull()
  })
  it('sem lista de módulos fica undefined (igual ao Firestore)', () => {
    expect(mapUsuarioSupabase(linha({ modulos_liberados: null }))?.modulosLiberados).toBeUndefined()
  })
})

describe('statusDoPerfil', () => {
  const u = (extra: Partial<LinhaUsuario> = {}) => mapUsuarioSupabase(linha(extra))
  it('segue as mesmas regras do Firebase', () => {
    expect(statusDoPerfil(null, null)).toBe('incomplete')
    expect(statusDoPerfil(u({ recusado: true }), null)).toBe('rejected')
    expect(statusDoPerfil(u({ ativo: false }), null)).toBe('pending')
    expect(statusDoPerfil(u({ unidade_id: null }), null)).toBe('pending')
    expect(statusDoPerfil(u(), false)).toBe('pending')
    expect(statusDoPerfil(u(), null)).toBe('pending')
    expect(statusDoPerfil(u(), true)).toBe('ready')
    expect(statusDoPerfil(u({ papel: 'admin', unidade_id: null }), null)).toBe('ready')
    expect(statusDoPerfil(u({ papel: 'equipe_franqueadora', unidade_id: null }), null)).toBe('ready')
  })
})

describe('resolverSupabaseConfig', () => {
  it('usa a URL e a chave publicável por padrão', () => {
    const c = resolverSupabaseConfig({})
    expect(c.url).toBe('https://zmreflstgxgofvuhzqau.supabase.co')
    expect(c.chave.startsWith('sb_publishable_')).toBe(true)
  })
  it('recusa chave secreta ou service_role no navegador', () => {
    expect(() => resolverSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_x' })).toThrow()
    const corpo = btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/, '')
    expect(() => resolverSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: `e30.${corpo}.x` })).toThrow()
  })
})
