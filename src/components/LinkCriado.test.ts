// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LinkCriado } from './LinkCriado'

const enviarEmailRedefinicao = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../lib/gestao', () => ({ enviarEmailRedefinicao }))

const acesso = {
  uid: 'pessoa',
  email: 'pessoa@example.test',
  link: 'https://example.test/?token_hash=ficticio&type=recovery',
  expiraEm: new Date(2026, 0, 2, 9, 5).toISOString(),
}

let raiz: Root
let container: HTMLDivElement
let fechar: ReturnType<typeof vi.fn<() => void>>

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  raiz = createRoot(container)
  fechar = vi.fn()
  await act(async () => raiz.render(createElement(LinkCriado, { acesso, aoFechar: fechar })))
})

afterEach(async () => {
  await act(async () => raiz.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function clicar(texto: string) {
  const botao = Array.from(container.querySelectorAll('button')).find((botao) => botao.textContent === texto)
  expect(botao).toBeDefined()
  await act(async () => botao?.click())
}

it('mostra o link somente para leitura e permite copiá-lo e fechar sem enviar e-mail', async () => {
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const campo = container.querySelector('input')
  expect(campo?.readOnly).toBe(true)
  expect(campo?.value).toBe(acesso.link)
  expect(container.textContent).toContain('Válido até 09:05 de 02/01')
  await clicar('Copiar link')
  expect(writeText).toHaveBeenCalledWith(acesso.link)
  expect(container.textContent).toContain('Link copiado')
  await clicar('Fechar')
  expect(fechar).toHaveBeenCalledOnce()
  expect(enviarEmailRedefinicao).not.toHaveBeenCalled()
})

it('seleciona o link para cópia manual se a área de transferência falhar', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) } })
  await clicar('Copiar link')
  const campo = container.querySelector('input')
  expect(document.activeElement).toBe(campo)
  expect(campo?.selectionStart).toBe(0)
  expect(campo?.selectionEnd).toBe(acesso.link.length)
})

it('só envia e-mail após o clique e retira da tela o link anterior', async () => {
  await clicar('Enviar e-mail de redefinição')
  expect(enviarEmailRedefinicao).toHaveBeenCalledWith(acesso.email)
  expect(container.querySelector('input')).toBeNull()
  expect(container.textContent).toContain('O link anterior foi cancelado.')
})

it('orienta a gerar outro link quando só a geração falha', async () => {
  await act(async () => raiz.render(createElement(LinkCriado, {
    acesso: { uid: acesso.uid, email: acesso.email, link: null, erroLink: 'Não foi possível gerar o link.' },
    aoFechar: fechar,
  })))
  expect(container.querySelector('input')).toBeNull()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Use “Gerar novo link”')
})
