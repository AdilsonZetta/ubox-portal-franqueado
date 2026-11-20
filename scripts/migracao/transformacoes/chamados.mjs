// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  chamados: tabela('chamados', `
    titulo! categoria! prioridade! descricao! anexos:j status unidade_id! unidade_nome! aberto_por:u!
    aberto_por_nome! responsavel_id:u? responsavel_nome? avaliacao? sla_horas! criado_em:d atualizado_em:d
    resolvido_em:d? fechado_em:d? reaberto_em:d?
  `, {
    enums: { categoria: 'operacao marketing financeiro juridico sistemas implantacao outros', status: 'aberto em_andamento aguardando_franqueado resolvido fechado', prioridade: 'urgente alta media baixa' },
    responsavelOpcional: true,
  }),
  'chamados/eventos': tabela('chamado_eventos', `
    tipo! texto! de para autor_id:u! autor_nome! criado_em:d
  `, {
    enums: { tipo: 'comentario status responsavel abertura' },
    pai: 'chamado_id:chamados',
  }),
}
