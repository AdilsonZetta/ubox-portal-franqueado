import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeAcessar, statusAcesso } from '../_shared/acesso-regras.ts'
import { ErroPedido } from '../_shared/acesso-http.ts'
import { criarAsaas, handlerAsaas, mapearCobranca } from './handler.ts'

test('autoriza administrador, equipe da unidade e cliente apenas nas respectivas operações', () => {
  const ativo = { ativo: true, recusado: false }
  assert.equal(podeAcessar({ ...ativo, papel: 'admin' }, 'u', 'testar'), true)
  const equipe = { ...ativo, papel: 'equipe_franqueado', unidade_id: 'u', unidade_ativa: true, tem_modulo: true }
  assert.equal(podeAcessar(equipe, 'u', 'testar'), true)
  assert.equal(podeAcessar(equipe, 'outra', 'testar'), false)
  assert.equal(podeAcessar({ ...equipe, tem_modulo: false }, 'u', 'testar'), false)
  const cliente = { ...ativo, papel: 'cliente', cliente_id: 'c' }
  assert.equal(podeAcessar(cliente, 'u', 'listar_cobrancas', 'c'), true)
  assert.equal(podeAcessar(cliente, 'u', 'listar_cobrancas', 'outro'), false)
  assert.equal(podeAcessar(cliente, 'u', 'testar', 'c'), false)
  assert.equal(podeAcessar({ ...ativo, papel: 'equipe_franqueadora' }, 'u', 'testar'), false)
})

test('aplica prioridade e limite inclusivo da tolerância', () => {
  const hoje = '2026-11-27'
  assert.equal(statusAcesso(false, true, '2026-11-10', 5, hoje), 'Sem facial')
  assert.equal(statusAcesso(true, true, '2026-11-10', 5, hoje), 'Liberado manualmente')
  assert.equal(statusAcesso(true, false, '2026-11-21', 5, hoje), 'Bloqueado por inadimplência')
  assert.equal(statusAcesso(true, false, '2026-11-22', 5, hoje), 'Liberado')
})

test('mapeia status e inclui código PIX e valores em reais', () => {
  for (const [entrada, status] of Object.entries({
    RECEIVED: 'pago', CONFIRMED: 'pago', PENDING: 'em_aberto',
    OVERDUE: 'vencido', REFUNDED: 'estornado', UNKNOWN: 'em_analise',
  })) {
    assert.deepEqual(mapearCobranca({
      id: 'pay_teste', dueDate: '2026-11-27', value: 14.75, status: entrada,
      billingType: 'PIX', payload: 'codigo de teste',
    }), {
      payment_id: 'pay_teste', vencimento: '2026-11-27', valor: 14.75, status,
      pix_copia_cola: 'codigo de teste', link_boleto: null, invoice_url: null,
    })
  }
})

test('envia consulta CPF normalizada ao endpoint fixo do ambiente', async () => {
  const chamadas = []
  const asaas = criarAsaas({ ambiente: 'sandbox', chave: 'fixture' }, async (url, opcoes) => {
    chamadas.push([String(url), opcoes.headers.access_token])
    return Response.json({ data: [] })
  })
  await asaas('/customers', { cpfCnpj: '12345678901' })
  assert.deepEqual(chamadas, [['https://api-sandbox.asaas.com/v3/customers?cpfCnpj=12345678901', 'fixture']])
})

function montar({ papel = 'franqueado', remoto, chave, fallback = null } = {}) {
  let cache = []
  let gravacao
  let consultas = 0
  const handler = handlerAsaas(async req => {
    if (!req.headers.has('Authorization')) throw new ErroPedido(401, 'Entre no portal.')
    return {
      perfil: { id: 'p', papel, ativo: true, unidade_id: 'u', cliente_id: 'c', unidade_ativa: true, tem_modulo: true },
      cliente: async id => ({ id, unidade_id: id === 'outro' ? 'v' : 'u', asaas_customer_id: 'cus_teste', cpf: '12345678901' }),
      lerChave: async () => chave ?? { ambiente: 'sandbox', chave: 'fixture' },
      lerFallback: async () => fallback,
      salvarChave: async (unidade, config) => { gravacao = { unidade, ambiente: config.ambiente } },
      temCpf: async () => false,
      lerCache: async () => cache,
      salvarCache: async (_cliente, linhas) => { cache = linhas },
    }
  }, async (...args) => {
    consultas++
    return remoto(...args)
  })
  const chamar = (acao, dados = {}, sessao = true) => handler(new Request('https://edge.test', {
    method: 'POST',
    headers: sessao ? { Authorization: 'Bearer fixture' } : {},
    body: JSON.stringify({ acao, ...dados }),
  }))
  return { chamar, consultas: () => consultas, gravacao: () => gravacao }
}

test('valida sessão e impede chamadas entre unidades antes de acessar o Asaas', async () => {
  const { chamar, consultas } = montar()
  assert.equal((await chamar('testar', { unidade_id: 'u' }, false)).status, 401)
  assert.equal((await chamar('testar', { unidade_id: 'v' })).status, 403)
  assert.equal((await chamar('sincronizar_cliente', { cliente_id: 'outro' })).status, 403)
  assert.equal(consultas(), 0)
})

test('salva somente a chave válida e responde com metadados', async () => {
  const { chamar, gravacao } = montar()
  assert.equal((await chamar('salvar_chave', { unidade_id: 'u', ambiente: 'producao', chave: 'invalida' })).status, 400)
  const chave = '$aact_hmlg_' + 'a'.repeat(12)
  const res = await chamar('salvar_chave', { unidade_id: 'u', ambiente: 'sandbox', chave })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ambiente: 'sandbox', configurada: true })
  assert.deepEqual(gravacao(), { unidade: 'u', ambiente: 'sandbox' })
})

test('testar devolve erro em português sem incluir o corpo da resposta externa', async () => {
  const { chamar } = montar({ remoto: async () => new Response('fixture', { status: 401 }) })
  const res = await chamar('testar', { unidade_id: 'u' })
  assert.equal(res.status, 200)
  const { ok, erro } = await res.json()
  assert.equal(ok, false)
  assert.match(erro, /Asaas/)
  assert.doesNotMatch(erro, /fixture/)
})

test('buscar_cliente_cpf normaliza o documento e usa somente os campos do contrato', async () => {
  const { chamar } = montar({ remoto: async url => {
    assert.equal(url.searchParams.get('cpfCnpj'), '12345678901')
    return Response.json({ data: [{
      id: 'cus_teste', cpfCnpj: '12345678901', name: 'Cliente Teste', email: 'cliente@example.test', mobilePhone: '3433000000',
    }] })
  } })
  const res = await chamar('buscar_cliente_cpf', { unidade_id: 'u', cpf: '123.456.789-01' })
  assert.deepEqual(await res.json(), {
    encontrado: true, asaas_customer_id: 'cus_teste', nome: 'Cliente Teste', email: 'cliente@example.test', telefone: '3433000000',
  })
})

test('cliente só lista as próprias cobranças e um cache vazio sincroniza PIX, boleto e cartão', async () => {
  const { chamar, consultas } = montar({ papel: 'cliente', remoto: async () => Response.json({ data: [
    { id: 'pay_pix', dueDate: '2026-11-25', value: 10.5, status: 'PENDING', billingType: 'PIX', payload: 'codigo de teste', customer: 'cus_teste' },
    { id: 'pay_bol', dueDate: '2026-11-25', value: 20, status: 'OVERDUE', billingType: 'BOLETO', bankSlipUrl: 'https://example.test/boleto', customer: 'cus_teste' },
    { id: 'pay_cartao', dueDate: '2026-11-25', value: 30, status: 'RECEIVED', billingType: 'CREDIT_CARD', customer: 'cus_teste' },
    { id: 'pay_outro', dueDate: '2026-11-25', value: 40, status: 'RECEIVED', customer: 'cus_outro' },
  ] }) })
  assert.equal((await chamar('sincronizar_cliente', { cliente_id: 'c' })).status, 403)
  assert.equal((await chamar('listar_cobrancas', { unidade_id: 'u', cliente_id: 'outro' })).status, 403)
  assert.equal((await chamar('listar_cobrancas', { unidade_id: 'v', cliente_id: 'c' })).status, 403)
  const listar = () => chamar('listar_cobrancas', { unidade_id: 'u', cliente_id: 'c' })
  const res = await listar()
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), [
    { id: 'pay_pix', vencimento: '2026-11-25', valor: 10.5, status: 'em_aberto', link_boleto: null, invoice_url: null, pix_copia_cola: 'codigo de teste' },
    { id: 'pay_bol', vencimento: '2026-11-25', valor: 20, status: 'vencido', link_boleto: 'https://example.test/boleto', invoice_url: null },
    { id: 'pay_cartao', vencimento: '2026-11-25', valor: 30, status: 'pago', link_boleto: null, invoice_url: null },
  ])
  assert.equal((await listar()).status, 200)
  assert.equal(consultas(), 1)
})

test('fallback da rede limita a busca de CPF a cadastros da unidade', async () => {
  const { chamar, consultas } = montar({ chave: {}, fallback: { ambiente: 'sandbox', chave: 'fixture' } })
  const res = await chamar('buscar_cliente_cpf', { unidade_id: 'u', cpf: '123.456.789-01' })
  assert.deepEqual(await res.json(), { encontrado: false })
  assert.equal(consultas(), 0)
})
