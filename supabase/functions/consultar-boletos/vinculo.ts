import type { BoletoAsaas } from './asaas.ts'

export function boletoParaVinculo(boletos: BoletoAsaas[], id: unknown): BoletoAsaas | null {
  return typeof id === 'string' ? boletos.find((boleto) => boleto.id === id) ?? null : null
}
