// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  estoqueItens: tabela('estoque_itens', `
    nome! codigo categoria! unidade_medida! estoque_minimo! preco_sugerido_centavos! descricao ativo
    gerado_por_ia ia_modelo criado_em:d atualizado_por:u! atualizado_por_nome! atualizado_em:d
  `, {
    enums: { categoria: 'insumos cadeados caixas embalagens limpeza uniformes outro', unidade_medida: 'un cx pct par kg l m rolo' },
  }),
  estoqueContagens: tabela('estoque_contagens', `
    unidade_id! unidade_nome! itens:j! total_itens! total_divergencias! obs status criado_por:u!
    criado_por_nome! criado_em:d confirmado_por:u? confirmado_nome confirmado_em:d? atualizado_por:u!
    atualizado_por_nome! atualizado_em:d
  `, {
    enums: { status: 'aberta confirmada cancelada' },
  }),
  estoquePedidos: tabela('estoque_pedidos', `
    unidade_id! unidade_nome! itens:j! total_itens! status obs_unidade obs_franqueadora solicitante_uid:u!
    solicitante_nome! criado_em:d aprovado_em:d? enviado_em:d? recebido_em:d? cancelado_em:d?
    atualizado_por:u! atualizado_por_nome! atualizado_em:d
  `, {
    enums: { status: 'aberto aprovado enviado recebido cancelado' },
  }),
  estoqueMovimentos: tabela('estoque_movimentos', `
    unidade_id! unidade_nome! item_id! item_nome! unidade_medida! tipo! quantidade! delta! motivo origem
    origem_id indice uid:u! nome! criado_em:d
  `, {
    enums: { tipo: 'entrada saida venda ajuste', origem: 'manual contagem pedido' },
    validar({ origem = 'manual', tipo }, registrar) {
      const permitido = { manual: ['entrada', 'saida', 'venda'], contagem: ['ajuste'], pedido: ['entrada'] }
      if (!permitido[origem].includes(tipo)) registrar('tipo', 'tipo incompatível com a origem')
    },
  }),
}
