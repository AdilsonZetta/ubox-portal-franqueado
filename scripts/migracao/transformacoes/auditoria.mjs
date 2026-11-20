// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  auditoriaModelos: tabela('auditoria_modelos', `
    titulo! descricao itens:j! total_itens! peso_total! nota_minima! versao ativo gerado_por_ia ia_modelo
    criado_em:d! atualizado_por:u! atualizado_por_nome! atualizado_em:d!
  `),
  auditorias: tabela('auditorias', `
    unidade_id! unidade_nome! modelo_id! modelo_titulo! modelo_versao! modalidade! data_visita:d!
    auditor_uid:u! auditor_nome! respostas:j! total_itens! peso_total! qtd_ok! qtd_nao_ok! qtd_na!
    pontos_obtidos! pontos_possiveis! score! nota_minima! checklist_execucao_id checklist_score? resultado!
    obs_geral gerado_por_ia ia_modelo status assinatura_auditor_uid:u? assinatura_auditor_nome
    assinatura_auditor_em:d? ciencia_uid:u? ciencia_nome ciencia_em:d? contestacao criado_em:d!
    atualizado_em:d!
  `, {
    enums: { modalidade: 'visita presencial remota', status: 'rascunho aguardando_ciencia concluida', resultado: 'aprovada reprovada' },
  }),
  auditoriaAcoes: tabela('auditoria_acoes', `
    auditoria_id! unidade_id! item_id! item_texto! descricao! responsavel! prazo:d! status evidencia_url
    comentario_unidade comentario_franqueadora criado_em:d! atualizado_por:u! atualizado_por_nome!
    atualizado_em:d!
  `, {
    enums: { status: 'aberta em_andamento concluida_unidade validada reaberta' },
  }),
}
