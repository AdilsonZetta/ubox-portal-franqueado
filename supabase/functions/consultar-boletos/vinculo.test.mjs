import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boletoParaVinculo } from './vinculo.ts'

test('somente vincula o boleto selecionado e verificado nessa consulta', () => {
  const pago = { id: 'pay_1', vencimento: '2026-11-25', situacao: 'pago', valorCentavos: 100, descricao: '' }
  const vencido = { ...pago, id: 'pay_2', situacao: 'vencido' }
  assert.equal(boletoParaVinculo([pago, vencido], 'pay_2'), vencido)
  assert.equal(boletoParaVinculo([pago], 'pay_outro'), null)
  assert.equal(boletoParaVinculo([pago], { id: 'pay_1' }), null)
})
