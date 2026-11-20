// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

export default {
  nuvemLinks: tabela('nuvem_links', `
    titulo! descricao url! pasta! tags visibilidade! unidades dono! gerado_por_ia ia_modelo criado_por:u!
    criado_por_nome! criado_em:d! atualizado_por:u! atualizado_por_nome! atualizado_em:d!
  `, {
    enums: { visibilidade: 'rede franqueadora unidades privada' },
    validar({ dono, visibilidade }, registrar) {
      if ((dono !== '') !== (visibilidade === 'privada')) {
        registrar('visibilidade', 'visibilidade incompatível com o dono')
      }
    },
  }),
}
