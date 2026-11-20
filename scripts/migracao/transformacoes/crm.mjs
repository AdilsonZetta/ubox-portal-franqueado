// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { tabela } from './base.mjs'

const camposContato = ['nome', 'telefone', 'email', 'interesseTamanho', 'interessePeriodo', 'interesseUso']
const lead = tabela('crm_leads', `
  unidade_id! unidade_nome! origem! valor_estimado_centavos? etapa motivo_perda responsavel_uid:u!
  responsavel_nome! proximo_contato:d? ultima_atividade_em:d? arquivado criado_em:d etapa_em:d fechado_em:d?
  atualizado_por:u! atualizado_por_nome! atualizado_em:d
`, {
  enums: { etapa: 'novo contato visita proposta ganho perdido' },
})
const contato = tabela('crm_contatos', `
  unidade_id! nome! telefone! email! interesse_tamanho! interesse_periodo! interesse_uso! atualizado_por:u!
  atualizado_em:d
`)

function comLead(item, id, unidade) {
  return {
    ...item,
    depende: { tabela: 'crm_leads', coluna: 'id', valor: id, unidade },
  }
}

export function validarParesCrm(linhas, pendencias) {
  // A fase 12 exige contato da mesma unidade. Seu gatilho adiado só roda
  // pela API, então a carga precisa conferir os pares antes do INSERT.
  const chave = ({ id, unidade_id }) => JSON.stringify([id, unidade_id])
  const contatos = new Set(linhas.filter(item => item.tabela === 'crm_contatos').map(item => chave(item.linha)))
  return linhas.filter(({ tabela, linha, caminho }) => {
    if (tabela !== 'crm_leads' || contatos.has(chave(linha))) return true
    pendencias.push({ tabela, caminho, motivo: 'contato CRM correspondente ausente ou inválido' })
    return false
  })
}

export default {
  crmConfig: tabela('crm_config', `
    origens:j! motivos_perda:j! atualizado_por:u! atualizado_por_nome! atualizado_em:d
  `),
  crmLeads: {
    ...lead,
    transformar(doc, ctx) {
      const resultado = lead.transformar(doc, ctx)
      const bruto = doc.data.__tipo === 'mapa' ? doc.data.campos : doc.data
      const embutidos = camposContato.filter(campo => Object.hasOwn(bruto, campo))
      // A exportação atual traz crmContatos à parte. Um lead legado com os
      // dados embutidos só pode escrevê-los na tabela restrita da fase 12.
      if (!embutidos.length) return resultado
      resultado.desconhecidos = resultado.desconhecidos.filter(campo => !embutidos.includes(campo))
      if (ctx.temDocumento?.('crmContatos/' + doc.id)) {
        resultado.pendencias.push({ tabela: contato.nome, motivo: 'contato separado preferido aos campos embutidos' })
        return resultado
      }
      const dadosContato = Object.fromEntries(
        [...camposContato, 'unidadeId', 'atualizadoPor', 'atualizadoEm']
          .filter(campo => Object.hasOwn(bruto, campo)).map(campo => [campo, bruto[campo]]),
      )
      const separado = contato.transformar({ ...doc, data: dadosContato }, ctx)
      resultado.pendencias.push(...separado.pendencias)
      if (resultado.linhas.length) resultado.linhas.push(...separado.linhas)
      return resultado
    },
  },
  crmContatos: {
    ...contato,
    transformar(doc, ctx) {
      const resultado = contato.transformar(doc, ctx)
      resultado.linhas = resultado.linhas.map(item => comLead(item, doc.id, item.linha.unidade_id))
      return resultado
    },
  },
  crmAtividades: tabela('crm_atividades', `
    lead_id! unidade_id! tipo! texto! uid:u! nome! gerado_por_ia! ia_modelo! criado_em:d
  `, {
    enums: { tipo: 'ligacao whatsapp visita email nota' },
  }),
  crmPropostas: tabela('crm_propostas', `
    lead_id! unidade_id! box! preco_mensal_centavos! periodo_meses! validade:d! status obs! gerado_por_ia!
    ia_modelo! criado_em:d atualizado_por:u! atualizado_por_nome! atualizado_em:d
  `, {
    enums: { status: 'enviada aceita recusada expirada' },
  }),
}
