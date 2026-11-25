export type SituacaoBoleto = 'pago' | 'em_aberto' | 'vencido' | 'estornado' | 'em_analise'

export interface BoletoAsaas {
  id: string
  vencimento: string
  valorCentavos: number
  descricao: string
  situacao: SituacaoBoleto
}

interface Consulta {
  cpfCnpj: string
  inicio: string
  fim: string
}

interface Configuracao {
  ambiente: 'sandbox' | 'producao'
  chave: string
  buscar?: typeof fetch
}

function normalizarDocumento(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length > 32) return ''
  return valor.trim().toUpperCase().replace(/[./-]/g, '')
}

export function periodoDeConsulta(documento: unknown, mes: unknown): Consulta | null {
  const cpfCnpj = normalizarDocumento(documento)
  if (!/^([0-9]{11}|[A-Z0-9]{12}[0-9]{2})$/.test(cpfCnpj)) return null
  if (typeof mes !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(mes)) return null
  const [ano, numeroMes] = mes.split('-').map(Number)
  const fim = new Date(Date.UTC(ano, numeroMes, 0)).toISOString().slice(0, 10)
  return { cpfCnpj, inicio: `${mes}-01`, fim }
}

function situacaoDoBoleto(status: unknown): SituacaoBoleto {
  switch (status) {
    case 'CONFIRMED':
    case 'RECEIVED':
      return 'pago'
    case 'PENDING':
      return 'em_aberto'
    case 'OVERDUE':
      return 'vencido'
    case 'REFUNDED':
      return 'estornado'
    default:
      return 'em_analise'
  }
}

export async function consultarBoletos(config: Configuracao, consulta: Consulta): Promise<BoletoAsaas[]> {
  const dominio = config.ambiente === 'producao' ? 'api.asaas.com' : 'api-sandbox.asaas.com'
  const buscar = config.buscar ?? fetch
  const signal = AbortSignal.timeout(12_000)

  async function listar(caminho: 'customers' | 'payments', filtros: Record<string, string>) {
    const itens: Record<string, unknown>[] = []
    for (let pagina = 0; pagina < 10; pagina++) {
      const url = new URL(`https://${dominio}/v3/${caminho}`)
      url.search = new URLSearchParams({ ...filtros, offset: String(itens.length), limit: '100' }).toString()
      const resp = await buscar(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Portal-UBOX', access_token: config.chave },
        redirect: 'error',
        signal,
      })
      if (!resp.ok) throw new Error('Consulta ao Asaas indisponível.')
      const dados: unknown = await resp.json()
      if (!dados || typeof dados !== 'object' || !('data' in dados) || !('hasMore' in dados)
        || !Array.isArray(dados.data) || typeof dados.hasMore !== 'boolean') {
        throw new Error('Resposta incompleta do Asaas.')
      }
      for (const item of dados.data) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Resposta incompleta do Asaas.')
        itens.push(item)
      }
      if (!dados.hasMore) return itens
      if (!dados.data.length) break
    }
    throw new Error('Limite de resultados do Asaas atingido.')
  }

  const cadastros = await listar('customers', { cpfCnpj: consulta.cpfCnpj })
  const clientes = new Set<string>()
  for (const cadastro of cadastros) {
    if (normalizarDocumento(cadastro.cpfCnpj) === consulta.cpfCnpj && typeof cadastro.id === 'string' && cadastro.id) {
      clientes.add(cadastro.id)
    }
  }
  if (clientes.size > 10) throw new Error('Limite de cadastros do Asaas atingido.')

  const boletos = new Map<string, BoletoAsaas>()
  await Promise.all(Array.from(clientes, async (cliente) => {
    const cobrancas = await listar('payments', {
      customer: cliente,
      billingType: 'BOLETO',
      'dueDate[ge]': consulta.inicio,
      'dueDate[le]': consulta.fim,
    })
    for (const dados of cobrancas) {
      if (dados.customer !== cliente || dados.billingType !== 'BOLETO' || dados.deleted === true) continue
      const { id, dueDate, value, description, status } = dados
      if (typeof id !== 'string' || !id || typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
        || typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error('Cobrança incompleta no Asaas.')
      }
      if (dueDate < consulta.inicio || dueDate > consulta.fim) continue
      boletos.set(id, {
        id,
        vencimento: dueDate,
        valorCentavos: Math.round(value * 100),
        descricao: typeof description === 'string' ? description.trim().slice(0, 160) : '',
        situacao: situacaoDoBoleto(status),
      })
    }
  }))
  return Array.from(boletos.values()).sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id))
}
