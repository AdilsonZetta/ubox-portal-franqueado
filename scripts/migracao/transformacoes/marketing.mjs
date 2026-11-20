// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  marketingCampanhas: tabela('marketing_campanhas', `
    titulo! descricao tipo inicio:d! fim:d! ativo gerado_por_ia ia_modelo atualizado_por:u!
    atualizado_por_nome! atualizado_em:d
  `, {
    enums: { tipo: 'campanha data_comemorativa lancamento' },
  }),
  marketingMateriais: tabela('marketing_materiais', `
    titulo! descricao tipo categoria campanha_id url! previa_url formato regras_uso valido_de:d? valido_ate:d?
    publico unidades ativo gerado_por_ia ia_modelo criado_em:d atualizado_por:u! atualizado_por_nome!
    atualizado_em:d
  `, {
    enums: { tipo: 'arte campanha logo marca template video outro' },
  }),
  marketingSolicitacoes: tabela('marketing_solicitacoes', `
    uid:u! nome! unidade_id! unidade_nome! titulo! tipo_peca! descricao! medidas prazo_desejado:d?
    referencia_url campanha_id status complemento resposta entrega_url gerado_por_ia ia_modelo
    responsavel_nome criado_em:d atualizado_em:d entregue_em:d?
  `, {
    enums: { tipo_peca: 'post story banner panfleto fachada video outro', status: 'aberta em_producao aguardando_unidade entregue cancelada' },
  }),
}
