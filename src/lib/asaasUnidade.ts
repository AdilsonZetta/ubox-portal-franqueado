import { requireSupabase } from './supabase'

interface BuscaCpf {
  encontrado: boolean
  asaas_customer_id?: string
  nome?: string
  email?: string
  telefone?: string
}

export const AVISO_ASAAS = 'Não foi possível consultar o Asaas. Preencha os dados manualmente.'

export async function consultarCpfAsaas(
  unidadeId: string, cpf: string,
  invocar: (body: object) => Promise<{ data?: unknown; error?: unknown }> =
    (body) => requireSupabase().functions.invoke('asaas-unidade', { body, timeout: 8_000 }),
): Promise<BuscaCpf | null> {
  try {
    const { data, error } = await invocar({ acao: 'buscar_cliente_cpf', unidade_id: unidadeId, cpf })
    const resultado = data as BuscaCpf | null
    return !error && typeof resultado?.encontrado === 'boolean' ? resultado : null
  } catch {
    return null
  }
}

export const ROTULOS_FATURA = {
  pago: 'Paga', em_aberto: 'Em aberto', vencido: 'Vencida', estornado: 'Estornada', em_analise: 'Em análise',
} as const

export interface Fatura {
  id: string
  valor: number
  vencimento: string
  status: keyof typeof ROTULOS_FATURA
  link_boleto?: string
  invoice_url?: string
  pix_copia_cola?: string
}

export async function listarFaturasAsaas(unidadeId: string, clienteId: string): Promise<Fatura[] | null> {
  try {
    const { data, error } = await requireSupabase().functions.invoke('asaas-unidade', {
      timeout: 10_000,
      body: { acao: 'listar_cobrancas', unidade_id: unidadeId, cliente_id: clienteId },
    })
    const faturas = Array.isArray(data) ? data : data?.cobrancas
    if (error || !Array.isArray(faturas) || !faturas.every((f: Fatura) =>
      f && typeof f.id === 'string' && Number.isFinite(f.valor) && /^\d{4}-\d{2}-\d{2}$/.test(f.vencimento)
        && Object.hasOwn(ROTULOS_FATURA, f.status))) return null
    return faturas
  } catch {
    return null
  }
}
