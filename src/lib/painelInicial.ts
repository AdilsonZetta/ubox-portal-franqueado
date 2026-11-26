import { calcularPrazoChamado, chamadoPendente } from '../data/chamados'
import type { DadosAcompanhamento } from './acompanhamentoApi'
import type { Fontes } from './acompanhamento'
import type { Designado } from './adesao'
import { calcularTotais, inicioPeriodo, modeloServeUnidade, situacaoModelo, vigenciaDe, type VigenciaChecklist } from './checklist'
import { resumoRede } from './estoque'
import type { DadosEstoque } from './estoqueApi'

type Chamados = DadosAcompanhamento['fontes']['chamados']

export function chamadosDoPainel(chamados: Chamados, agora: number, unidadeId?: string, uid?: string) {
  if (!chamados) return null
  const abertos = chamados.filter((c) => chamadoPendente(c.status)
    && (!unidadeId || c.unidadeId === unidadeId) && (!uid || c.abertoPor === uid))
  return {
    abertos: abertos.length,
    vencidos: abertos.filter((c) => calcularPrazoChamado(c, agora).atrasado).length,
    aguardando: abertos.filter((c) => c.status === 'aguardando_franqueado').length,
  }
}

export function rotinasDeHoje(
  modelos: Fontes['modelosChecklist'], execucoes: Fontes['execucoes'],
  vigencias: VigenciaChecklist[], unidadeId: string, agora: number,
) {
  if (!modelos || !execucoes) return null
  const inicio = inicioPeriodo('diaria', agora)
  const daUnidade = execucoes.filter((e) => e.unidadeId === unidadeId && e.criadoEmMs <= agora)
  const feitasHoje = new Set(daUnidade.filter((e) => e.criadoEmMs >= inicio).map((e) => e.modeloId))
  const totais = { concluidas: 0, atrasadas: 0, pendentes: 0 }
  for (const modelo of modelos) {
    if (modelo.frequencia === 'avulsa' || !modeloServeUnidade(modelo, unidadeId)) continue
    const estado = situacaoModelo(modelo, daUnidade, agora, vigenciaDe(vigencias, modelo.id, unidadeId))
    if (estado.aguardandoInicio) continue
    if (estado.situacao === 'atrasado') totais.atrasadas++
    else if (estado.situacao === 'pendente') totais.pendentes++
    else if (feitasHoje.has(modelo.id)) totais.concluidas++
  }
  return totais
}

export function conformidade30Dias(execucoes: Fontes['execucoes'], unidades: ReadonlySet<string> | null, agora: number) {
  if (!execucoes) return null
  const recentes = execucoes.filter((e) => (!unidades || unidades.has(e.unidadeId)) && e.criadoEmMs >= agora - 30 * 86_400_000 && e.criadoEmMs <= agora)
  return recentes.length ? Math.round(recentes.reduce((total, e) => total + calcularTotais(e.respostas).score, 0) / recentes.length) : null
}

export function adesaoDoPainel(
  designados: Designado[] | null, conteudos: ReadonlySet<string> | null,
  concluidos: { uid: string; unidadeId: string; conteudoId: string }[] | null,
) {
  if (!designados || !conteudos || !concluidos) return null
  const chavePessoa = (p: { unidadeId: string; uid: string }) => JSON.stringify([p.unidadeId, p.uid])
  const pessoas = new Set(designados.map(chavePessoa))
  const porPessoa = new Map<string, Set<string>>()
  for (const item of concluidos) {
    const chave = chavePessoa(item)
    if (!pessoas.has(chave) || !conteudos.has(item.conteudoId)) continue
    const feitos = porPessoa.get(chave) ?? new Set<string>()
    feitos.add(item.conteudoId)
    porPessoa.set(chave, feitos)
  }
  return {
    designados: pessoas.size,
    concluidos: conteudos.size ? [...porPessoa.values()].filter((feitos) => feitos.size === conteudos.size).length : 0,
  }
}

export function estoqueDoPainel(dados: DadosEstoque, unidades?: { id: string; nome: string }[]) {
  const linhas = resumoRede(dados.itens, dados.movimentos, dados.pedidos, dados.contagens, unidades)
  const ids = new Set(linhas.map((l) => l.unidadeId))
  return {
    unidades: linhas.filter((l) => l.itensBaixos + l.itensZerados > 0).length,
    baixos: linhas.reduce((s, l) => s + l.itensBaixos, 0),
    zerados: linhas.reduce((s, l) => s + l.itensZerados, 0),
    abertas: dados.contagens.filter((c) => ids.has(c.unidadeId) && c.status === 'aberta').length,
  }
}

export function atividadeRecente(fontes: DadosAcompanhamento['fontes'], agora: number) {
  const eventos = [
    ...(fontes.execucoes ?? []).map((e) => ({
      unidadeId: e.unidadeId, unidadeNome: e.unidadeNome, data: e.criadoEmMs, tipo: 'Checklist concluído', titulo: e.modeloTitulo,
      para: e.id ? `/checklist/execucao/${encodeURIComponent(e.id)}` : '/checklist/gestao',
    })),
    ...(fontes.chamados ?? []).map((c) => ({
      unidadeId: c.unidadeId, unidadeNome: c.unidadeNome, data: c.criadoEmMs, tipo: 'Chamado aberto', titulo: c.titulo,
      para: c.id ? `/chamados?id=${encodeURIComponent(c.id)}` : '/chamados',
    })),
    ...(fontes.auditorias ?? []).filter((a) => a.status !== 'rascunho').map((a) => ({
      unidadeId: a.unidadeId, unidadeNome: a.unidadeNome, data: a.assinaturaAuditorEmMs || a.dataVisitaMs, tipo: 'Auditoria assinada', titulo: a.modeloTitulo,
      para: `/auditorias/${encodeURIComponent(a.id)}`,
    })),
  ]
  return eventos.filter((e) => e.data > 0 && e.data <= agora).sort((a, b) => b.data - a.data).slice(0, 8)
}

export function treinamentoDaUnidade(unidadeId: string, progresso: Fontes['progresso'], tentativas: Fontes['tentativas']) {
  if (!progresso && !tentativas) return null
  const leituras = progresso?.filter((p) => p.unidadeId === unidadeId)
  const provas = tentativas?.filter((p) => p.unidadeId === unidadeId)
  const concluidos = new Set(leituras?.filter((p) => p.status === 'concluido').map((p) => JSON.stringify([p.uid, p.documentoId])))
  const emAndamento = new Set(leituras?.filter((p) => p.status === 'em_andamento').map((p) => JSON.stringify([p.uid, p.documentoId])))
  return {
    pessoas: new Set([...(leituras ?? []), ...(provas ?? [])].map((p) => p.uid)).size,
    manuais: leituras ? { concluidos: concluidos.size, emAndamento: [...emAndamento].filter((id) => !concluidos.has(id)).length } : null,
    certificados: provas ? new Set(provas.filter((p) => p.aprovado).map((p) => JSON.stringify([p.uid, p.cursoId]))).size : null,
  }
}
