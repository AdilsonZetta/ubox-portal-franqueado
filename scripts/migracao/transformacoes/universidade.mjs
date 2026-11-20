// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  cursos: tabela('cursos', `
    titulo! descricao! ordem! aulas! publicado! atualizado_por:u? atualizado_por_nome! atualizado_em:d
  `),
  provas: tabela('provas', `
    titulo! nota_minima! perguntas:j! total_perguntas! manual_retorno_id! tempo_reestudo_seg! versao!
    publicado! atualizado_por:u? atualizado_por_nome! atualizado_em:d
  `, {
    identidade: 'cursoId',
  }),
  provasGabarito: tabela('provas_gabarito', `
    corretas! versao! atualizado_por:u? atualizado_em:d
  `, {
    identidade: 'cursoId',
  }),
  tentativasProva: tabela('tentativas_prova', `
    uid:u! curso_id! ciclo! numero! nome! unidade_id! unidade_nome! versao! aprovado? criado_em:d
    corrigido_em:d?
  `, {
    idComUid: true,
    filha: 'folha/atual',
  }),
  'tentativasProva/folha': tabela('tentativas_prova_folha', `
    uid:u! versao! respostas!
  `, {
    pai: 'tentativa_id:tentativas_prova',
    paiComUid: true,
    idFilho: 'atual',
    pk: 'tentativa_id',
  }),
  reestudos: tabela('reestudos', `
    uid:u! curso_id! ciclo documento_id! status reinicios concluido_em:d? iniciado_em:d atualizado_em:d
  `, {
    idComUid: true,
    enums: { status: 'em_andamento concluido' },
  }),
}
