import { autenticar, resultado } from '../_shared/acesso-banco.ts'
import { corpoJson, endpoint, ErroPedido, identificador, semPermissao } from '../_shared/acesso-http.ts'
import { podeAcessar } from '../_shared/acesso-regras.ts'
import { hikvision } from '../_shared/hikvision.ts'
import { gerarToken, hashToken } from '../_shared/webhook-token.ts'

const camposConfig = 'tolerancia_dias, asaas_ambiente, asaas_configurada_em, hikvision_tipo, hikvision_host, hikvision_porta, hikvision_configurada_em, webhook_token_prefix'
const configuracaoPadrao = {
  tolerancia_dias: 5, asaas_ambiente: null, asaas_configurada_em: null, hikvision_tipo: null,
  hikvision_host: null, hikvision_porta: null, hikvision_configurada_em: null, webhook_token_prefix: null,
}

function texto(valor: unknown, max: number) {
  if (typeof valor !== 'string' || !valor.trim() || valor.length > max) throw new ErroPedido(400, 'Confira os campos do formulário.')
  return valor.trim()
}

Deno.serve(endpoint(async (req) => {
  const { usuario, banco, perfil } = await autenticar(req)
  if (!podeAcessar(perfil, perfil.unidade_id ?? '', 'gerenciar_acesso')) semPermissao()
  const corpo = await corpoJson(req)
  const { acao } = corpo

  if (acao === 'liberar_acesso' || acao === 'remover_liberacao') {
    const liberar = acao === 'liberar_acesso'
    const data = liberar ? corpo.valido_ate ?? null : null
    if (data !== null && (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data))) {
      throw new ErroPedido(400, 'Informe uma data de validade válida.')
    }
    resultado(await usuario.rpc('ubox_acesso_liberacao', {
      p_cliente: identificador(corpo.cliente_id), p_liberar: liberar,
      p_motivo: liberar ? texto(corpo.motivo, 500) : null, p_valido_ate: data,
    }))
    return { ok: true }
  }

  const unidade = identificador(corpo.unidade_id)
  if (!podeAcessar(perfil, unidade, 'gerenciar_acesso')) semPermissao()

  const lerConfig = async () => resultado(await banco.from('unidade_acesso_config')
    .select(camposConfig).eq('unidade_id', unidade).maybeSingle()) ?? configuracaoPadrao
  const atualizar = async (campos: Record<string, unknown>) => {
    // PATCH primeiro para que gravações de campos distintos não restaurem valores padrão.
    const dados = { ...campos, atualizado_em: new Date().toISOString(), atualizado_por: perfil.id }
    resultado(await banco.from('unidade_acesso_config').upsert({ unidade_id: unidade }, { onConflict: 'unidade_id', ignoreDuplicates: true }))
    resultado(await banco.from('unidade_acesso_config').update(dados).eq('unidade_id', unidade))
  }

  switch (acao) {
    case 'listar_acessos':
      return resultado(await usuario.rpc('ubox_acesso_listar', { p_unidade: unidade }))
    case 'ler_configuracao':
      return await lerConfig()
    case 'salvar_tolerancia': {
      const dias = corpo.tolerancia_dias
      if (typeof dias !== 'number' || !Number.isInteger(dias) || dias < 0 || dias > 90) {
        throw new ErroPedido(400, 'Informe de 0 a 90 dias de tolerância.')
      }
      await atualizar({ tolerancia_dias: dias })
      return await lerConfig()
    }
    case 'salvar_hikvision': {
      const tipo = corpo.tipo
      const host = texto(corpo.host, 253)
      const porta = corpo.porta
      if ((tipo !== 'terminal_facial' && tipo !== 'hikcentral') || !/^[a-zA-Z0-9.:[\]-]+$/.test(host)
        || typeof porta !== 'number' || !Number.isInteger(porta) || porta < 1 || porta > 65535
        || typeof corpo.senha !== 'string' || !corpo.senha.trim() || corpo.senha.length > 512) {
        throw new ErroPedido(400, 'Confira o tipo, host, porta e credenciais do aparelho.')
      }
      resultado(await banco.rpc('ubox_acesso_salvar_segredo', {
        p_unidade: unidade, p_tipo: 'hikvision', p_autor: perfil.id,
        p_config: { tipo, host, porta, usuario: texto(corpo.usuario, 120), senha: corpo.senha },
      }))
      return await lerConfig()
    }
    case 'testar_hikvision':
      return await hikvision.testarConexao()
    case 'gerar_webhook': {
      const token = gerarToken()
      const prefixo = token.slice(0, 6)
      await atualizar({ webhook_token_hash: await hashToken(token), webhook_token_prefix: prefixo })
      const url = new URL('/functions/v1/asaas-webhook', Deno.env.get('SUPABASE_URL')!)
      url.searchParams.set('token', token)
      return { url: url.toString(), prefixo }
    }
    default:
      throw new ErroPedido(400, 'Operação inválida.')
  }
}))
