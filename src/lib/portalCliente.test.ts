import { expect, test } from 'vitest'
import { cpfValido, emailCliente } from '../../supabase/functions/_shared/cpf'
import { destinoPortal } from './rotasCliente'
import { consultarCpfAsaas } from './asaasUnidade'

test('valida os dígitos do CPF', () => {
  expect(cpfValido('529.982.247-25')).toBe(true)
  for (const cpf of ['', '11111111111', '52998224726', 'abc52998224725']) expect(cpfValido(cpf)).toBe(false)
})

test('e-mail sintético distingue unidades com grafias semelhantes', async () => {
  const cpf = '52998224725'
  expect(await emailCliente(cpf, 'UBOX A')).toMatch(/^c52998224725\.[a-z0-9-]+@clientes\.ubox\.local$/)
  expect(await emailCliente(cpf, 'UBOX A')).not.toBe(await emailCliente(cpf, 'ubox-a'))
})

test('protege o portal e preserva o painel público', () => {
  expect(destinoPortal('cliente', '/clientes')).toBe('/portal')
  expect(destinoPortal('cliente', '/')).toBe('/portal')
  expect(destinoPortal('franqueado', '/portal')).toBe('/')
  expect(destinoPortal('cliente', '/painel/token')).toBeNull()
})

test('permite preencher manualmente quando o Asaas estiver indisponível', async () => {
  for (const resposta of [{ data: { erro: 'Asaas não configurado' } }, { error: { context: { status: 404 } } }]) {
    await expect(consultarCpfAsaas('u', '52998224725', async () => resposta)).resolves.toBeNull()
  }
})
