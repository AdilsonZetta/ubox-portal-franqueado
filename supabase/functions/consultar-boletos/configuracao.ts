export interface ConfiguracaoAsaas {
  ambiente: 'sandbox' | 'producao'
  chave: string
}

export function lerConfiguracao(dados: unknown): ConfiguracaoAsaas | null {
  if (!dados || typeof dados !== 'object' || !('ambiente' in dados) || !('chave' in dados)) return null
  const { ambiente, chave } = dados
  if (ambiente !== 'sandbox' && ambiente !== 'producao') return null
  if (typeof chave !== 'string' || !chave) return null
  return { ambiente, chave }
}

export function validarNovaConfiguracao(dados: unknown): ConfiguracaoAsaas | null {
  const config = lerConfiguracao(dados)
  if (!config) return null
  const prefixo = config.ambiente === 'sandbox' ? '$aact_hmlg_' : '$aact_prod_'
  if (!config.chave.startsWith(prefixo) || config.chave.length < 16 || config.chave.length > 512
    || /[^!-~]/.test(config.chave)) return null
  return config
}
