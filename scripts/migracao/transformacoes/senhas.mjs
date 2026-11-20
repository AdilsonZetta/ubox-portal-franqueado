// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  acessos: tabela('acessos', `
    nome! categoria! url escopo! unidade_id unidade_nome responsavel_id:u? responsavel_nome! visivel_para:U
    visivel_para_equipe ultima_troca_em:d pendente_troca criado_por:u! criado_por_nome! criado_em:d
    atualizado_em:d
  `, {
    enums: { categoria: 'gestao email redes_sociais portaria cameras outros', escopo: 'unidade rede' },
  }),
  'acessos/segredo': tabela('acesso_segredos', `
    login! senha! notas atualizado_em:d atualizado_por:u!
  `, {
    pai: 'acesso_id:acessos',
    idFilho: 'atual',
    pk: 'acesso_id',
  }),
  'acessos/eventos': tabela('acesso_eventos', `
    tipo! texto! autor_id:u! autor_nome! criado_em:d
  `, {
    enums: { tipo: 'criacao atualizacao revelou copiou permissao troca_senha' },
    pai: 'acesso_id:acessos',
  }),
  solicitacoesAcesso: tabela('solicitacoes_acesso', `
    tipo! status acesso_id acesso_nome unidade_id! unidade_nome! solicitado_por:u! solicitado_por_nome! motivo
    alvo_uid:u? alvo_nome decidido_por:u? decidido_por_nome? criado_em:d atualizado_em:d
  `, {
    enums: { tipo: 'pedir_acesso novo_sistema revogar trocar_senha', status: 'aberta aprovada recusada concluida' },
  }),
}
