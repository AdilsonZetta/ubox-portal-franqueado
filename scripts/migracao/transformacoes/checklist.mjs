// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  checklistModelos: tabela('checklist_modelos', `
    titulo! descricao tipo! frequencia! itens:j! total_itens! peso_total! versao publico unidades ativo
    gerado_por_ia ia_modelo criado_em:d! atualizado_por:u! atualizado_por_nome! atualizado_em:d!
  `, {
    enums: { tipo: 'abertura fechamento limpeza inauguracao vistoria outro', frequencia: 'diaria semanal mensal avulsa' },
  }),
  checklistExecucoes: tabela('checklist_execucoes', `
    modelo_id! modelo_titulo! modelo_versao! tipo! frequencia! unidade_id! unidade_nome! uid:u! nome!
    respostas:j! total_itens! qtd_ok! qtd_nao_ok! qtd_na! pontos_obtidos! pontos_possiveis! score! obs_geral
    obs_proprietario obs_proprietario_por:u? obs_proprietario_nome obs_proprietario_em:d? criado_em:d!
  `, {
    enums: { tipo: 'abertura fechamento limpeza inauguracao vistoria outro', frequencia: 'diaria semanal mensal avulsa' },
  }),
}
