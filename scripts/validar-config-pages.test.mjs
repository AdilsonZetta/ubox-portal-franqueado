// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { expect, it, vi } from 'vitest'
import { validarConfigPages } from './validar-config-pages.mjs'

const jwt = role => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.assinatura'
const url = 'https://ubox.test'
const publicar = 'sb_publishable_ficticia'
function executar(env = {}) {
  const informarErro = vi.fn()
  const status = validarConfigPages(env, informarErro)
  return { status, saida: informarErro.mock.calls.flat() }
}

it.each([
  ' "\'sb_secret_ficticia\'" ',
  'prefixo-SB_SECRET_ficticia',
  ` " ${jwt('service_role')} " `,
])('recusa segredo sem imprimir o valor', chave => {
  const { status, saida } = executar({ VITE_SUPABASE_PUBLISHABLE_KEY: chave })
  expect(status).toBe(1)
  expect(saida).toEqual(['Use apenas uma chave publicável do Supabase no build do Pages.'])
})

it.each([jwt('anon'), publicar])('aceita chave pública com URL', chave => {
  expect(executar({
    VITE_BACKEND: 'supabase', VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: chave,
  }).status).toBe(0)
})

it('aceita Firebase por padrão com variáveis vazias', () => {
  expect(executar().status).toBe(0)
})

it('exige URL para Supabase mesmo com aspas e espaços no seletor', () => {
  const resultado = executar({ VITE_BACKEND: ' " SuPaBaSe " ', VITE_SUPABASE_PUBLISHABLE_KEY: publicar })
  expect(resultado.status).toBe(1)
  expect(resultado.saida).toEqual(['Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para o backend Supabase.'])
})

it.each([
  ['VITE_SUPABASE_URL', ` ${url} `],
  ['VITE_SUPABASE_PUBLISHABLE_KEY', ` ${publicar} `],
  ['VITE_SUPABASE_PUBLISHABLE_KEY', `"${publicar}"`],
])('recusa formatação extra em %s sem imprimir o valor', (nome, valor) => {
  const { status, saida } = executar({
    VITE_BACKEND: 'supabase', VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: publicar, [nome]: valor,
  })
  expect(status).toBe(1)
  expect(saida).toEqual([`Remova aspas/espaços da variável ${nome}.`])
})
