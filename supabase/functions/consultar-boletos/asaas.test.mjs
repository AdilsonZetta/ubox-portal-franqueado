import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consultarBoletos, periodoDeConsulta } from './asaas.ts'

const periodo = { inicio: '2028-02-01', fim: '2028-02-29' }
const documento = '123.456.789-09'
const resposta = (data, hasMore = false) => Response.json({ data, hasMore })
const boleto = (id, customer, status, outros = {}) => ({
  id, customer, status, billingType: 'BOLETO', dueDate: '2028-02-15', value: 150, description: 'Mensalidade', ...outros,
})

test('normaliza o documento e calcula o último dia do mês', () => {
  assert.deepEqual(periodoDeConsulta(documento, '2028-02'), { cpfCnpj: '12345678909', ...periodo })
  assert.equal(periodoDeConsulta('12.ABC.345/01DE-35', '2028-02')?.cpfCnpj, '12ABC34501DE35')
  assert.equal(periodoDeConsulta('texto ' + documento, '2028-02'), null)
  assert.equal(periodoDeConsulta(documento, '2028-13'), null)
})

test('lista os boletos de cadastros duplicados sem transformar qualquer pagamento em liberação', async () => {
  const consultas = []
  const buscar = async (url, init) => {
    consultas.push({ url, init })
    if (url.pathname.endsWith('/customers')) return resposta([
      { id: 'cus_um', cpfCnpj: '12345678909' }, { id: 'cus_dois', cpfCnpj: '12345678909' },
      { id: 'cus_outro', cpfCnpj: '98765432100' },
    ])
    const cliente = url.searchParams.get('customer')
    if (cliente === 'cus_um') return resposta([
      boleto('pay_pago', cliente, 'CONFIRMED'),
      boleto('pay_pix', cliente, 'RECEIVED', { billingType: 'PIX' }),
      boleto('pay_outra_data', cliente, 'RECEIVED', { dueDate: '2028-01-15' }),
      boleto('pay_outra_pessoa', 'cus_outro', 'RECEIVED'),
    ])
    if (cliente === 'cus_dois') return resposta([
      boleto('pay_vencido', cliente, 'OVERDUE'), boleto('pay_estorno', cliente, 'REFUNDED'),
      boleto('pay_recebido', cliente, 'RECEIVED'), boleto('pay_futuro', cliente, 'DESCONHECIDO'),
    ])
    throw new Error('O documento de outro cliente não deve ser consultado')
  }

  const lista = await consultarBoletos({ ambiente: 'sandbox', chave: 'teste', buscar }, { cpfCnpj: '12345678909', ...periodo })
  assert.deepEqual(Object.fromEntries(lista.map(({ id, situacao }) => [id, situacao])), {
    pay_pago: 'pago', pay_vencido: 'vencido', pay_estorno: 'estornado', pay_recebido: 'pago', pay_futuro: 'em_analise',
  })
  assert.equal(lista.find(({ id }) => id === 'pay_pago')?.valorCentavos, 15000)
  assert.equal(consultas[0].url.hostname, 'api-sandbox.asaas.com')
  assert.equal(consultas[0].url.searchParams.get('cpfCnpj'), '12345678909')
  assert.equal(consultas[0].init.headers.access_token, 'teste')
  assert.equal(consultas[0].init.redirect, 'error')
  for (const { url } of consultas.slice(1)) {
    assert.equal(url.searchParams.get('billingType'), 'BOLETO')
    assert.equal(url.searchParams.get('dueDate[ge]'), '2028-02-01')
    assert.equal(url.searchParams.get('dueDate[le]'), '2028-02-29')
  }
})

test('lê a próxima página e distingue falha do Asaas de uma lista vazia', async () => {
  const buscar = async (url) => {
    if (url.pathname.endsWith('/customers')) {
      return resposta([{ id: 'cus_um', cpfCnpj: '12345678909' }])
    }
    if (url.searchParams.get('offset') === '0') return resposta([boleto('pay_um', 'cus_um', 'PENDING')], true)
    return resposta([boleto('pay_dois', 'cus_um', 'RECEIVED')])
  }
  const consulta = { cpfCnpj: '12345678909', ...periodo }
  const config = { ambiente: 'producao', chave: 'teste', buscar }
  assert.deepEqual((await consultarBoletos(config, consulta)).map(({ id }) => id), ['pay_dois', 'pay_um'])
  assert.deepEqual(await consultarBoletos({ ...config, buscar: async () => resposta([]) }, consulta), [])
  await assert.rejects(consultarBoletos({
    ...config, buscar: async () => new Response('indisponível', { status: 503 }),
  }, consulta))
})
