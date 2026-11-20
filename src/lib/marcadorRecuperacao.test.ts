// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { concluirRecuperacao, iniciarRecuperacao, limparRecuperacao, restaurarRecuperacao } from './marcadorRecuperacao'

const chave = 'ubox:recuperando-senha'
const chaveConcluida = 'ubox:recuperacao-concluida'
const sessao = { access_token: 'token-inválido' }

afterEach(() => sessionStorage.clear())

it('grava, restaura com sessão e limpa o marcador', () => {
  iniciarRecuperacao()
  expect(sessionStorage.getItem(chave)).toBe('1')
  expect(restaurarRecuperacao(sessao)).toBe(true)
  limparRecuperacao()
  expect(sessionStorage.getItem(chave)).toBeNull()
  expect(restaurarRecuperacao(sessao)).toBe(false)
})

it('limpa o marcador sem sessão', () => {
  iniciarRecuperacao()
  expect(restaurarRecuperacao(null)).toBe(false)
  expect(sessionStorage.getItem(chave)).toBeNull()
})

function sessaoComJwt(method: string, session_id?: string, timestamp = 123) {
  const payload = btoa(JSON.stringify({ amr: [{ method, timestamp }], session_id }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return { access_token: `e30.${payload}.assinatura` }
}

it.each(['recovery', 'otp', 'password'])('verifica o método %s no JWT', method => {
  expect(restaurarRecuperacao(sessaoComJwt(method))).toBe(method !== 'password')
})

it.each(['recovery', 'otp'])('ignora o método %s após concluir na mesma sessão', method => {
  const sessao = sessaoComJwt(method, 'sessao-original')
  expect(restaurarRecuperacao(sessao)).toBe(true)
  concluirRecuperacao(sessao)
  expect(Object.entries(sessionStorage)).toEqual([[chaveConcluida, 'sessao-original']])
  expect(restaurarRecuperacao(sessao)).toBe(false)
  expect(restaurarRecuperacao(sessaoComJwt(method, 'sessao-original', 456))).toBe(false)
  expect(restaurarRecuperacao(sessaoComJwt(method, 'outra-sessao'))).toBe(true)
})

it('restaura a recuperação após concluir com um JWT sem identificador de sessão', () => {
  const sessao = sessaoComJwt('recovery')
  concluirRecuperacao(sessao)
  expect(sessionStorage.length).toBe(0)
  expect(restaurarRecuperacao(sessao)).toBe(true)
})

it('limpa a conclusão ao encerrar a sessão', () => {
  const sessao = sessaoComJwt('recovery', 'sessao-original')
  concluirRecuperacao(sessao)
  limparRecuperacao()
  expect(sessionStorage.getItem(chaveConcluida)).toBeNull()
  expect(restaurarRecuperacao(sessao)).toBe(true)
})

it.each(['inválido', 'a.%%%.c', 'a.eA.c', 'a.bnVsbA.c', 'a.eyJhbXIiOltudWxsXX0.c'])(
  'ignora token malformado ou sem método de recuperação',
  access_token => expect(restaurarRecuperacao({ access_token })).toBe(false),
)
