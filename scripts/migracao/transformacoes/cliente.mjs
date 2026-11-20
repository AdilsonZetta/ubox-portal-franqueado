// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  clientes: tabela('clientes', `
    unidade_id! nome! telefone! email! box! contrato_inicio:d! contrato_fim:d? valor_mensal_centavos!
    dia_vencimento! status! painel_token! obs! criado_em:d atualizado_por:u! atualizado_por_nome!
    atualizado_em:d
  `, {
    enums: { status: 'ativo encerrado' },
  }),
  clientePaineis: tabela('cliente_paineis', `
    unidade_id! unidade_nome! contato_unidade! cliente_id! primeiro_nome! box! contrato_inicio:d!
    contrato_fim:d? valor_mensal_centavos! dia_vencimento! ativo! atualizado_em:d
  `, {
    id: 'token',
  }),
  'clientePaineis/cobrancas': tabela('cliente_painel_cobrancas', `
    competencia! valor_centavos! vencimento! status! pago_em!
  `, {
    enums: { status: 'pendente pago' },
    pai: 'painel_token:cliente_paineis:token',
    pk: 'painel_token, id',
  }),
  'clientePaineis/visitas': tabela('cliente_painel_visitas', `
    data! hora! motivo! status!
  `, {
    enums: { status: 'agendada realizada cancelada' },
    pai: 'painel_token:cliente_paineis:token',
    pk: 'painel_token, id',
  }),
  'clientePaineis/recados': tabela('cliente_painel_recados', `
    texto! criado_em:d autor! gerado_por_ia! ia_modelo!
  `, {
    pai: 'painel_token:cliente_paineis:token',
    pk: 'painel_token, id',
  }),
}
