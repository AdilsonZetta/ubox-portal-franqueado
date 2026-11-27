import { lerConfiguracao, validarNovaConfiguracao, type ConfiguracaoAsaas } from '../consultar-boletos/configuracao.ts'
import { corpoJson, endpoint, ErroPedido, identificador, objeto, semPermissao } from '../_shared/acesso-http.ts'
import { podeAcessar, type PerfilAcesso } from '../_shared/acesso-regras.ts'

export const digitos = (valor: unknown) => typeof valor === 'string' ? valor.replace(/\D/g, '') : ''
export const idAsaas = (valor: unknown, prefixo: 'pay' | 'cus'): valor is string =>
  typeof valor === 'string' && valor.startsWith(prefixo + '_') && /^[a-zA-Z0-9_-]{5,100}$/.test(valor)

const statusAsaas = {
  CONFIRMED: 'pago', RECEIVED: 'pago', PENDING: 'em_aberto', OVERDUE: 'vencido', REFUNDED: 'estornado',
} as const

function link(valor: unknown) {
  if (typeof valor !== 'string' || valor.length > 2048) return null
  try { return new URL(valor).protocol === 'https:' ? valor : null } catch { return null }
}

export function mapearCobranca(entrada: unknown) {
  const p = objeto(entrada)
  if (!idAsaas(p.id, 'pay') || typeof p.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate)
    || !Number.isFinite(Date.parse(p.dueDate)) || new Date(p.dueDate).toISOString().slice(0, 10) !== p.dueDate
    || typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value < 0 || p.value >= 1e12) return null
  return {
    payment_id: p.id,
    vencimento: p.dueDate,
    valor: p.value, // Reais, conforme Asaas value.
    status: typeof p.status === 'string' && Object.hasOwn(statusAsaas, p.status) ? statusAsaas[p.status as keyof typeof statusAsaas] : 'em_analise',
    link_boleto: link(p.bankSlipUrl),
    invoice_url: link(p.invoiceUrl),
    pix_copia_cola: p.billingType === 'PIX' && typeof p.payload === 'string' ? p.payload.slice(0, 2048) : null,
  }
}

export type Cobranca = NonNullable<ReturnType<typeof mapearCobranca>>

export function criarAsaas(config: ConfiguracaoAsaas, requisitar = fetch) {
  const base = config.ambiente === 'sandbox' ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3'
  return async (rota: string, params: Record<string, string> = {}) => {
    const url = new URL(base + rota)
    url.search = new URLSearchParams(params).toString()
    try {
      const res = await requisitar(url, {
        headers: { access_token: config.chave, accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) throw new Error()
      return objeto(await res.json())
    } catch {
      throw new ErroPedido(502, 'Não foi possível consultar o Asaas. Confira a configuração e tente novamente.')
    }
  }
}

interface Cliente {
  id: string
  unidade_id: string
  asaas_customer_id: string | null
  cpf: string | null
}

interface Sessao {
  perfil: PerfilAcesso
  cliente: (id: string) => Promise<Cliente | null>
  lerChave: (unidade: string) => Promise<unknown>
  lerFallback: () => Promise<unknown>
  salvarChave: (unidade: string, config: ConfiguracaoAsaas) => Promise<void>
  temCpf: (unidade: string, cpf: string) => Promise<boolean>
  lerCache: (cliente: Cliente) => Promise<Cobranca[]>
  salvarCache: (cliente: Cliente, cobrancas: Cobranca[], revisao: string | null) => Promise<void>
}

export function handlerAsaas(autenticar: (req: Request) => Promise<Sessao>, requisitar = fetch) {
  return endpoint(async (req) => {
    const sessao = await autenticar(req)
    const corpo = await corpoJson(req)
    const acao = typeof corpo.acao === 'string' ? corpo.acao : ''
    const clienteInformado = typeof corpo.cliente_id === 'string' ? corpo.cliente_id : undefined
    if (!podeAcessar(sessao.perfil, sessao.perfil.unidade_id ?? '', acao, clienteInformado)) semPermissao()
    if (!['salvar_chave', 'testar', 'buscar_cliente_cpf', 'listar_cobrancas', 'sincronizar_cliente'].includes(acao)) {
      throw new ErroPedido(400, 'Operação inválida.')
    }
    const porCliente = acao === 'listar_cobrancas' || acao === 'sincronizar_cliente'
    const clienteId = porCliente ? identificador(corpo.cliente_id) : undefined
    const unidadeInformada = acao === 'sincronizar_cliente' ? null : identificador(corpo.unidade_id)
    if (!podeAcessar(sessao.perfil, unidadeInformada ?? sessao.perfil.unidade_id ?? '', acao, clienteId)) semPermissao()
    const cliente = clienteId ? await sessao.cliente(clienteId) : null
    if (porCliente && (!cliente || (unidadeInformada !== null && cliente.unidade_id !== unidadeInformada))) semPermissao()
    const unidade = cliente?.unidade_id ?? unidadeInformada!
    if (!podeAcessar(sessao.perfil, unidade, acao, clienteId)) semPermissao()

    if (acao === 'salvar_chave') {
      const config = validarNovaConfiguracao(corpo)
      if (!config) throw new ErroPedido(400, 'Confira se a chave corresponde ao ambiente escolhido.')
      await sessao.salvarChave(unidade, config)
      return { ambiente: config.ambiente, configurada: true }
    }

    async function conexao() {
      const segredo = objeto(await sessao.lerChave(unidade))
      const daUnidade = lerConfiguracao(segredo)
      const config = daUnidade ?? lerConfiguracao(await sessao.lerFallback())
      if (!config) throw new ErroPedido(503, 'A conexão com o Asaas ainda não foi configurada.')
      return { asaas: criarAsaas(config, requisitar), fallback: !daUnidade,
        revisao: typeof segredo.revisao === 'string' ? segredo.revisao : null }
    }

    if (acao === 'testar') {
      try {
        const { asaas } = await conexao()
        await asaas('/customers', { limit: '1' })
        return { ok: true }
      } catch (erro) {
        return { ok: false, erro: erro instanceof ErroPedido ? erro.message : 'Não foi possível testar a conexão com o Asaas.' }
      }
    }

    if (acao === 'buscar_cliente_cpf') {
      const cpf = digitos(corpo.cpf)
      if (cpf.length !== 11) throw new ErroPedido(400, 'Informe um CPF com 11 dígitos.')
      const { asaas, fallback } = await conexao()
      if (fallback && sessao.perfil.papel !== 'admin' && !await sessao.temCpf(unidade, cpf)) return { encontrado: false }
      const res = await asaas('/customers', { cpfCnpj: cpf, limit: '100' })
      const item = Array.isArray(res.data) ? res.data.map(objeto).find(c => digitos(c.cpfCnpj) === cpf && idAsaas(c.id, 'cus')) : null
      if (!item) return { encontrado: false }
      return {
        encontrado: true, asaas_customer_id: item.id,
        nome: typeof item.name === 'string' ? item.name : undefined,
        email: typeof item.email === 'string' ? item.email : undefined,
        telefone: typeof item.mobilePhone === 'string' ? item.mobilePhone : typeof item.phone === 'string' ? item.phone : undefined,
      }
    }

    async function sincronizar(c: Cliente) {
      if (!idAsaas(c.asaas_customer_id, 'cus')) return 0
      const { asaas, fallback, revisao } = await conexao()
      if (fallback) {
        const cpf = digitos(c.cpf)
        if (cpf.length !== 11 && cpf.length !== 14) return 0
        const remoto = await asaas('/customers/' + c.asaas_customer_id)
        if (digitos(remoto.cpfCnpj) !== cpf) return 0
      }
      const pagamentos: Cobranca[] = []
      const limite = 100
      for (let offset = 0; offset < 10_000; offset += limite) {
        const pagina = await asaas('/payments', { customer: c.asaas_customer_id, limit: String(limite), offset: String(offset) })
        if (!Array.isArray(pagina.data)) throw new ErroPedido(502, 'Resposta inválida do Asaas.')
        for (const item of pagina.data) {
          if (objeto(item).customer !== c.asaas_customer_id) continue
          const pagamento = mapearCobranca(item)
          if (pagamento) pagamentos.push(pagamento)
        }
        if (pagina.hasMore !== true) {
          await sessao.salvarCache(c, pagamentos, revisao)
          return pagamentos.length
        }
      }
      throw new ErroPedido(502, 'A consulta excedeu o limite de cobranças por cliente.')
    }

    if (!cliente) return semPermissao()
    if (acao === 'sincronizar_cliente') return { ok: true, quantidade: await sincronizar(cliente) }
    let cobrancas = await sessao.lerCache(cliente)
    if (!cobrancas.length) {
      await sincronizar(cliente)
      cobrancas = await sessao.lerCache(cliente)
    }
    return cobrancas.map(({ payment_id, valor, vencimento, status, link_boleto, pix_copia_cola, invoice_url }) => ({
      id: payment_id, valor, vencimento, status, link_boleto, invoice_url, ...(pix_copia_cola ? { pix_copia_cola } : {}),
    }))
  })
}
