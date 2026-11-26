import { calcularPrazoChamado } from '../data/chamados'
import type { Unidade } from '../types'
import {
  ORDEM_CLASSIFICACAO, motivoSaude, passoAtrasado, resumirUnidade, saudeDe, sinaisSaude,
} from './acompanhamento'
import type { DadosAcompanhamento } from './acompanhamentoApi'
import { acaoAtrasada } from './auditoria'
import { inicioPeriodo, modeloServeUnidade, situacaoModelo, vigenciaDe } from './checklist'

export function linhasRede<T extends Pick<Unidade, 'id' | 'nome' | 'ativo' | 'modulosLiberados'>>(unidades: T[], dados: DadosAcompanhamento, agora: number) {
  return unidades.filter((u) => u.ativo).map((u) => {
    const resumo = resumirUnidade(u, dados.fontes, agora, dados.vigenciasChecklist)
    const sinais = sinaisSaude(resumo, agora)
    return { u, resumo, sinais, saude: saudeDe(sinais), motivo: motivoSaude(sinais), destino: `/acompanhamento/unidade/${encodeURIComponent(u.id)}` }
  })
}

type LinhaRede = ReturnType<typeof linhasRede>[number]

export function compararLinhasRede(a: LinhaRede, b: LinhaRede) {
  return ORDEM_CLASSIFICACAO.indexOf(a.saude) - ORDEM_CLASSIFICACAO.indexOf(b.saude) || a.u.nome.localeCompare(b.u.nome, 'pt-BR')
}

interface PendenciaRede {
  titulo: string
  responsavel?: string | null
  prazoMs: number
  destino: string
}

export function pendenciaPrincipal(linha: LinhaRede, dados: DadosAcompanhamento, agora: number): PendenciaRede | undefined {
  const { u, motivo, destino } = linha
  const { fontes } = dados
  const pendencias: (PendenciaRede & { nivel: string })[] = []
  for (const { chave, nivel } of motivo.riscosConfirmados) {
    if (chave === 'passos') {
      for (const p of dados.passos) {
        if (p.unidadeId !== u.id || !passoAtrasado(p, agora)) continue
        pendencias.push({ ...p, nivel, titulo: p.descricao || 'Passo combinado', destino: `${destino}?passo=${encodeURIComponent(p.id)}` })
      }
    }
    if (chave === 'au-acoes') {
      for (const a of fontes.acoes ?? []) {
        if (a.unidadeId !== u.id || !a.id || !acaoAtrasada(a, agora)) continue
        const consulta = `acao=${encodeURIComponent(a.id)}`
        const rota = a.auditoriaId ? `/auditorias/${encodeURIComponent(a.auditoriaId)}?${consulta}` : '/auditoria?aba=acoes'
        pendencias.push({ ...a, nivel, titulo: a.descricao || 'Ação de auditoria', destino: rota })
      }
    }
    if (chave === 'ch') {
      for (const c of fontes.chamados ?? []) {
        if (c.unidadeId !== u.id || !c.id) continue
        const prazo = calcularPrazoChamado(c, agora)
        if (prazo.atrasado) pendencias.push({
          nivel, titulo: c.titulo || 'Chamado com prazo vencido', responsavel: c.responsavelNome, prazoMs: prazo.venceEmMs,
          destino: `/chamados?id=${encodeURIComponent(c.id)}`,
        })
      }
    }
    if (chave === 'ck-atraso' && fontes.execucoes) {
      const execucoes = fontes.execucoes.filter((e) => e.unidadeId === u.id)
      for (const m of fontes.modelosChecklist ?? []) {
        if (m.frequencia === 'avulsa' || !modeloServeUnidade(m, u.id)) continue
        const estado = situacaoModelo(m, execucoes, agora, vigenciaDe(dados.vigenciasChecklist ?? [], m.id, u.id))
        if (estado.situacao !== 'atrasado') continue
        const inicio = inicioPeriodo(m.frequencia, agora)
        pendencias.push({
          nivel, titulo: m.titulo || 'Rotina de checklist',
          prazoMs: Math.max(inicio, estado.primeiroVencimentoMs ?? 0) - 1,
          destino: '/checklist/gestao?aba=pendencias',
        })
      }
    }
  }
  return pendencias.sort((a, b) => Number(b.nivel === 'vermelho') - Number(a.nivel === 'vermelho') || a.prazoMs - b.prazoMs)[0]
}
