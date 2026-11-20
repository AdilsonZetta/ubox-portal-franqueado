// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthProvider, useAuth } from './auth'

const { definirNovaSenha, sairSupabase, onAuthStateChange } = vi.hoisted(() => ({
  definirNovaSenha: vi.fn(async () => {}),
  sairSupabase: vi.fn(async () => {}),
  onAuthStateChange: vi.fn(),
}))

vi.mock('./backend', () => ({ BACKEND: 'supabase' }))
vi.mock('./api', () => ({}))
vi.mock('./firebase', () => ({}))
vi.mock('./supabase', () => ({
  requireSupabase: () => ({
    auth: { onAuthStateChange, getSession: async () => ({ data: { session: sessao } }) },
  }),
}))
vi.mock('./supabaseAuth', () => ({
  definirNovaSenha,
  sairSupabase,
  carregarEstado: async () => ({ user: null, nomeSugerido: '', status: 'incomplete' }),
}))

const chave = 'ubox:recuperando-senha'
const chaveConcluida = 'ubox:recuperacao-concluida'
const payload = btoa(JSON.stringify({ session_id: 'sessao-ficticia', amr: [{ method: 'recovery' }] })).replace(/=+$/, '')
const sessao = { access_token: `e30.${payload}.assinatura` } as Session
let raiz: Root
let auth: ReturnType<typeof useAuth>
let emitir: (evento: AuthChangeEvent, sessao: Session | null) => void

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  onAuthStateChange.mockImplementation(callback => {
    emitir = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  raiz = createRoot(document.createElement('div'))
  function Consumidor() {
    auth = useAuth()
    return null
  }
  await act(async () => raiz.render(createElement(AuthProvider, { children: createElement(Consumidor) })))
})

afterEach(async () => {
  await act(async () => raiz.unmount())
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

it('restaura a recuperação no provedor ao receber a sessão inicial', async () => {
  sessionStorage.setItem(chave, '1')
  await act(async () => emitir('INITIAL_SESSION', sessao))
  expect(auth.recuperandoSenha).toBe(true)
})

it('mantém o bloqueio se a senha falhar e limpa o marcador após salvar', async () => {
  await act(async () => emitir('PASSWORD_RECOVERY', sessao))
  expect(sessionStorage.getItem(chave)).toBe('1')
  definirNovaSenha.mockRejectedValueOnce(new Error('Falha simulada'))
  await act(async () => { await expect(auth.definirSenha('ficticia')).rejects.toThrow('Falha simulada') })
  expect(auth.recuperandoSenha).toBe(true)
  expect(sessionStorage.getItem(chave)).toBe('1')
  await act(async () => auth.definirSenha('ficticia'))
  expect(auth.recuperandoSenha).toBe(false)
  expect(sessionStorage.getItem(chave)).toBeNull()
  expect(sessionStorage.getItem(chaveConcluida)).toBe('sessao-ficticia')
})

it.each(['evento', 'ação'])('limpa a recuperação na saída por %s', async (origem) => {
  sessionStorage.setItem(chaveConcluida, 'sessao-ficticia')
  await act(async () => emitir('PASSWORD_RECOVERY', sessao))
  await act(async () => {
    if (origem === 'evento') emitir('SIGNED_OUT', null)
    else await auth.sair()
  })
  expect(auth.recuperandoSenha).toBe(false)
  expect(sessionStorage.getItem(chave)).toBeNull()
  expect(sessionStorage.getItem(chaveConcluida)).toBeNull()
})
