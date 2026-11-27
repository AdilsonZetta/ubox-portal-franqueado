import { bancoServidor, resultado } from '../_shared/acesso-banco.ts'
import { corpoJson, endpoint, ErroPedido, objeto } from '../_shared/acesso-http.ts'
import { hashToken } from '../_shared/webhook-token.ts'
import { idAsaas, mapearCobranca } from '../asaas-unidade/handler.ts'

Deno.serve(endpoint(async (req) => {
  const token = req.headers.get('x-webhook-token') ?? new URL(req.url).searchParams.get('token')
  if (!token || !/^[0-9a-f]{64}$/.test(token)) throw new ErroPedido(401, 'Token de webhook inválido.')
  const hash = await hashToken(token)
  const banco = bancoServidor()
  const corpo = await corpoJson(req)
  const pagamento = objeto(corpo.payment ?? corpo)
  const eventoAceito = corpo.event === undefined || (typeof corpo.event === 'string' && corpo.event.startsWith('PAYMENT_'))
  const cobranca = eventoAceito ? mapearCobranca(pagamento) : null
  const aceito = resultado(await banco.rpc('ubox_acesso_receber_pagamento', {
    p_hash: hash, p_customer: idAsaas(pagamento.customer, 'cus') ? pagamento.customer : null, p_cobranca: cobranca,
  }))
  if (!aceito) throw new ErroPedido(401, 'Token de webhook inválido.')
  if (eventoAceito && !cobranca) throw new ErroPedido(400, 'Cobrança inválida.')
  return { ok: true }
}))
