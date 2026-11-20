// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  acompanhamentoRegistros: tabela('acompanhamento_registros', `
    unidade_id! unidade_nome! data:d! tipo! notas! compartilhado! gerado_por_ia! ia_modelo! autor_uid:u!
    autor_nome! criado_em:d! atualizado_por:u! atualizado_por_nome! atualizado_em:d!
  `, {
    enums: { tipo: 'visita reuniao call' },
  }),
  acompanhamentoPassos: tabela('acompanhamento_passos', `
    registro_id! unidade_id! descricao! responsavel! prazo:d! status! compartilhado! comentario_unidade!
    comentario_franqueadora! criado_em:d! atualizado_por:u! atualizado_por_nome! atualizado_em:d!
  `, {
    enums: { status: 'aberto concluido_unidade validado reaberto' },
  }),
}
