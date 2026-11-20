// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  categorias: tabela('categorias', `
    nome! descricao ordem parent_id? publico? unidades papeis uids_extra:U uids:U criado_em:d? atualizado_em:d
  `),
  documentos: tabela('documentos', `
    titulo! categoria_id! tipo status versao leitura_obrigatoria formato conteudo_html conteudo_texto
    html_conteudo html_url anexos:j publico unidades papeis uids_extra:U uids:U criado_em:d? atualizado_em:d
    atualizado_por:u? atualizado_por_nome publicado_em:d?
  `, {
    enums: { tipo: 'pop manual processo politica checklist html', status: 'rascunho publicado', formato: 'richtext html' },
  }),
  'documentos/versoes': tabela('documento_versoes', `
    versao titulo! formato conteudo_html conteudo_texto html_conteudo html_url criado_em:d autor_id:u?
    autor_nome
  `, {
    enums: { formato: 'richtext html' },
    pai: 'documento_id:documentos',
    chaveFilha: 'versao_id',
  }),
  trilhas: tabela('trilhas', `
    titulo! descricao nota_minima publicado? itens:j publico? unidades papeis uids_extra:U uids:U criado_em:d?
    atualizado_em:d
  `),
  quizzes: tabela('quizzes', `
    trilha_id titulo! nota_minima perguntas:j publicado publico unidades papeis uids_extra:U uids:U
    criado_em:d? atualizado_em:d
  `),
  'quizzes/gabarito': tabela('quiz_gabaritos', `
    respostas:j?
  `, {
    pai: 'quiz_id:quizzes',
    chaveFilha: 'gabarito_id',
    gabarito: true,
  }),
  gabarito: tabela('gabaritos', `
    respostas:j?
  `, {
    gabarito: true,
  }),
  avisos: tabela('avisos', `
    titulo! mensagem documento_id tipo publico unidades papeis uids_extra:U uids:U criado_em:d
  `, {
    enums: { tipo: 'novo atualizado geral' },
  }),
  leituras: tabela('leituras', `
    uid:u! documento_id! versao titulo lido_em:d
  `, { idComUid: true }),
  aceites: tabela('aceites', `
    uid:u! documento_id! versao! titulo nome! email! texto! aceito_em:d
  `, { idComUid: true, enums: { texto: ['Li e concordo'] } }),
  tentativas: tabela('tentativas', `
    uid:u! quiz_id! trilha_id nota aprovado? respostas:j respondido_em:d
  `),
  certificados: tabela('certificados', `
    uid:u! trilha_id! nome! trilha_titulo! codigo! tentativa_id! emitido_em:d
  `, { idComUid: true, referenciaTentativa: true }),
  avisosLeituras: tabela('avisos_leituras', `
    uid:u! aviso_id! lida_em:d
  `, { idComUid: true }),
  manuaisTrilha: tabela('manuais_trilha', `
    documento_id! titulo! etapa ordem tempo_minimo_seg! video_minutos anterior_id ativo atualizado_por:u?
    atualizado_por_nome! atualizado_em:d
  `),
  progressoManuais: tabela('progresso_manuais', `
    uid:u! documento_id! nome! unidade_id! unidade_nome! status reinicios tempo_minimo_seg! concluido_em:d?
    iniciado_em:d atualizado_em:d
  `, {
    idComUid: true,
    enums: { status: 'em_andamento concluido' },
  }),
}
