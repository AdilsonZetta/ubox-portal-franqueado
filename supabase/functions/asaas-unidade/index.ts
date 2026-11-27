import { autenticar, resultado } from '../_shared/acesso-banco.ts'
import { objeto } from '../_shared/acesso-http.ts'
import { digitos, handlerAsaas, type Cobranca } from './handler.ts'

Deno.serve(handlerAsaas(async (req) => {
  const { banco, perfil } = await autenticar(req)
  return {
    perfil,
    cliente: async (id) => resultado(await banco.from('clientes')
      .select('id, unidade_id, asaas_customer_id, cpf').eq('id', id).maybeSingle()),
    lerChave: async (unidade) => resultado(await banco.rpc('ubox_acesso_ler_segredo', {
      p_unidade: unidade, p_tipo: 'asaas',
    })),
    lerFallback: async () => resultado(await banco.rpc('ubox_asaas_ler_configuracao')) ?? {
      chave: Deno.env.get('ASAAS_API_KEY'), ambiente: Deno.env.get('ASAAS_AMBIENTE'),
    },
    salvarChave: async (unidade, config) => {
      resultado(await banco.rpc('ubox_acesso_salvar_segredo', {
        p_unidade: unidade, p_tipo: 'asaas', p_config: config, p_autor: perfil.id,
      }))
    },
    temCpf: async (unidade, cpf) => {
      const formatado = cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
      const linhas = resultado(await banco.from('clientes').select('cpf').eq('unidade_id', unidade)
        .in('cpf', [cpf, formatado]).limit(1))
      return (linhas ?? []).some(linha => digitos(objeto(linha).cpf) === cpf)
    },
    lerCache: async (cliente) => {
      const linhas: Cobranca[] = []
      const limite = 500
      for (let inicio = 0; ; inicio += limite) {
        const pagina = resultado(await banco.from('asaas_cobrancas_cache')
          .select('payment_id, valor, vencimento, status, link_boleto, pix_copia_cola, invoice_url')
          .eq('unidade_id', cliente.unidade_id).eq('cliente_id', cliente.id)
          .order('vencimento', { ascending: false }).order('payment_id').range(inicio, inicio + limite - 1)) as Cobranca[]
        linhas.push(...pagina)
        if (pagina.length < limite) return linhas
      }
    },
    salvarCache: async (cliente, cobrancas, revisao) => {
      resultado(await banco.rpc('ubox_acesso_sincronizar_cache', {
        p_unidade: cliente.unidade_id, p_cliente: cliente.id, p_customer: cliente.asaas_customer_id,
        p_revisao: revisao, p_cobrancas: cobrancas,
      }))
    },
  }
}))
