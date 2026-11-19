// Módulo 9: Acompanhamento do Franqueado. Lógica pura (sem Firebase), testada no Vitest.
import { calcularTotais, modeloServeUnidade, situacaoModelo, type ModeloChecklist, type Resposta } from './checklist'
import { acaoAtrasada, type StatusAcao } from './auditoria'

const DIA = 86_400_000
const HORA = 3_600_000

export const TIPOS_REGISTRO = ['visita', 'reuniao', 'call'] as const
export type TipoRegistro = (typeof TIPOS_REGISTRO)[number]
export const ROTULO_TIPO_REG: Record<TipoRegistro, string> = { visita: 'Visita', reuniao: 'Reunião', call: 'Call' }

export const STATUS_PASSO = ['aberto', 'concluido_unidade', 'validado', 'reaberto'] as const
export type StatusPasso = (typeof STATUS_PASSO)[number]
export const ROTULO_STATUS_PASSO: Record<StatusPasso, string> = {
  aberto: 'Aberto',
  concluido_unidade: 'Feito pela unidade',
  validado: 'Validado',
  reaberto: 'Reaberto',
}

export interface RegistroAc {
  id: string
  unidadeId: string
  unidadeNome: string
  dataMs: number
  tipo: TipoRegistro
  notas: string
  compartilhado: boolean
  geradoPorIA: boolean
  iaModelo: string
  autorUid: string
  autorNome: string
  criadoEmMs: number
  atualizadoPorNome: string
  atualizadoEmMs: number
}

export interface PassoAc {
  id: string
  registroId: string
  unidadeId: string
  descricao: string
  responsavel: string
  prazoMs: number
  status: StatusPasso
  compartilhado: boolean
  comentarioUnidade: string
  comentarioFranqueadora: string
  criadoEmMs: number
  atualizadoPorNome: string
  atualizadoEmMs: number
}

// ---------- Fontes agregadas (formas mínimas) ----------

export interface FonteExecucao { unidadeId: string; modeloId: string; criadoEmMs: number; respostas: Pick<Resposta, 'peso' | 'resultado'>[] }
export interface FonteAuditoria { id: string; unidadeId: string; dataVisitaMs: number; score: number; resultado: 'aprovada' | 'reprovada'; status: string; modeloTitulo: string }
export interface FonteAcao { unidadeId: string; status: StatusAcao; prazoMs: number }
export interface FonteChamado { unidadeId: string; status: string; criadoEmMs: number; slaHoras: number }
export interface FonteTentativa { unidadeId: string; uid: string; cursoId: string; aprovado: boolean | null }
export interface FonteProgresso { unidadeId: string; uid: string; documentoId: string; status: 'concluido' | 'em_andamento' }
export interface FontePedido { unidadeId: string; status: string }

export interface Fontes {
  modelosChecklist: Pick<ModeloChecklist, 'id' | 'frequencia' | 'criadoEmMs' | 'ativo' | 'publico' | 'unidades'>[] | null
  execucoes: FonteExecucao[] | null
  auditorias: FonteAuditoria[] | null
  acoes: FonteAcao[] | null
  chamados: FonteChamado[] | null
  tentativas: FonteTentativa[] | null
  cursosPublicados: number | null
  progresso: FonteProgresso[] | null
  trilhaManuais: number | null
  pedidos: FontePedido[] | null
  registros: Pick<RegistroAc, 'unidadeId' | 'dataMs'>[] | null
  passos: Pick<PassoAc, 'unidadeId' | 'status' | 'prazoMs'>[] | null
}

export interface ResumoUnidade {
  checklist: { aplica: boolean; media: number | null; execucoes: number; atrasados: number } | null
  auditoria: { ultima: FonteAuditoria | null; acoesAbertas: number; acoesAtrasadas: number; acoesParaValidar: number } | null
  chamados: { abertos: number; slaEstourado: number; aguardandoUnidade: number } | null
  universidade: { pessoas: number; certificados: number; pendentes: number; cursosPublicados: number | null } | null
  manuais: { pessoas: number; concluidos: number; emAndamento: number; trilha: number | null; percentual: number | null } | null
  marketing: { abertos: number; aguardandoUnidade: number; entregues: number } | null
  passos: { abertos: number; atrasados: number; paraValidar: number }
  ultimoContatoMs: number | null
}

const STATUS_CHAMADO_ABERTO = ['aberto', 'em_andamento', 'aguardando_franqueado']

export function slaEstourado(c: FonteChamado, agoraMs: number): boolean {
  return (c.status === 'aberto' || c.status === 'em_andamento') && c.criadoEmMs > 0 && agoraMs > c.criadoEmMs + c.slaHoras * HORA
}

export function passoAtrasado(p: Pick<PassoAc, 'status' | 'prazoMs'>, agoraMs: number): boolean {
  return acaoAtrasada({ prazoMs: p.prazoMs, status: p.status === 'aberto' ? 'aberta' : p.status === 'reaberto' ? 'reaberta' : 'validada' }, agoraMs)
}

/** Agrega o que a franqueadora consegue ler sobre uma unidade. `null` = fonte sem leitura (mostrada como indisponível). */
export function resumirUnidade(
  unidade: { id: string; modulosLiberados: string[] },
  f: Fontes,
  agoraMs: number,
): ResumoUnidade {
  const da = <T extends { unidadeId: string }>(l: T[] | null) => (l ? l.filter((x) => x.unidadeId === unidade.id) : null)

  let checklist: ResumoUnidade['checklist'] = null
  const execs = da(f.execucoes)
  if (execs && f.modelosChecklist) {
    const aplica = unidade.modulosLiberados.includes('checklist')
    const recentes = execs.filter((e) => e.criadoEmMs >= agoraMs - 30 * DIA)
    const scores = recentes.map((e) => calcularTotais(e.respostas).score)
    const atrasados = aplica
      ? f.modelosChecklist.filter((m) => modeloServeUnidade(m, unidade.id) && situacaoModelo(m, execs, agoraMs).situacao === 'atrasado').length
      : 0
    checklist = { aplica, media: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null, execucoes: recentes.length, atrasados }
  }

  let auditoria: ResumoUnidade['auditoria'] = null
  const auds = da(f.auditorias)
  const acoes = da(f.acoes)
  if (auds && acoes) {
    const assinadas = auds.filter((a) => a.status !== 'rascunho').sort((a, b) => b.dataVisitaMs - a.dataVisitaMs)
    auditoria = {
      ultima: assinadas[0] ?? null,
      acoesAbertas: acoes.filter((a) => ['aberta', 'em_andamento', 'reaberta'].includes(a.status)).length,
      acoesAtrasadas: acoes.filter((a) => acaoAtrasada(a, agoraMs)).length,
      acoesParaValidar: acoes.filter((a) => a.status === 'concluida_unidade').length,
    }
  }

  const chs = da(f.chamados)
  const chamados = chs
    ? {
        abertos: chs.filter((c) => STATUS_CHAMADO_ABERTO.includes(c.status)).length,
        slaEstourado: chs.filter((c) => slaEstourado(c, agoraMs)).length,
        aguardandoUnidade: chs.filter((c) => c.status === 'aguardando_franqueado').length,
      }
    : null

  let universidade: ResumoUnidade['universidade'] = null
  const ts = da(f.tentativas)
  if (ts) {
    const aprovados = new Set(ts.filter((t) => t.aprovado === true).map((t) => `${t.uid}|${t.cursoId}`))
    const tentados = new Set(ts.map((t) => `${t.uid}|${t.cursoId}`))
    universidade = {
      pessoas: new Set(ts.map((t) => t.uid)).size,
      certificados: aprovados.size,
      pendentes: [...tentados].filter((k) => !aprovados.has(k)).length,
      cursosPublicados: f.cursosPublicados,
    }
  }

  let manuais: ResumoUnidade['manuais'] = null
  const ps = da(f.progresso)
  if (ps) {
    const pessoas = new Set(ps.map((p) => p.uid)).size
    const concluidos = new Set(ps.filter((p) => p.status === 'concluido').map((p) => `${p.uid}|${p.documentoId}`)).size
    const emAndamento = ps.filter((p) => p.status === 'em_andamento').length
    const esperado = f.trilhaManuais && pessoas ? f.trilhaManuais * pessoas : 0
    manuais = { pessoas, concluidos, emAndamento, trilha: f.trilhaManuais, percentual: esperado ? Math.min(100, Math.round((concluidos * 100) / esperado)) : null }
  }

  const peds = da(f.pedidos)
  const marketing = peds
    ? {
        abertos: peds.filter((p) => ['aberta', 'em_producao', 'aguardando_unidade'].includes(p.status)).length,
        aguardandoUnidade: peds.filter((p) => p.status === 'aguardando_unidade').length,
        entregues: peds.filter((p) => p.status === 'entregue').length,
      }
    : null

  const passosUn = da(f.passos) ?? []
  const regs = da(f.registros) ?? []
  return {
    checklist,
    auditoria,
    chamados,
    universidade,
    manuais,
    marketing,
    passos: {
      abertos: passosUn.filter((p) => p.status === 'aberto' || p.status === 'reaberto').length,
      atrasados: passosUn.filter((p) => passoAtrasado(p, agoraMs)).length,
      paraValidar: passosUn.filter((p) => p.status === 'concluido_unidade').length,
    },
    ultimoContatoMs: regs.length ? Math.max(...regs.map((r) => r.dataMs)) : null,
  }
}

// ---------- Saúde da unidade ----------

export type Nivel = 'verde' | 'amarelo' | 'vermelho'
export interface Sinal {
  chave: string
  rotulo: string
  nivel: Nivel | 'neutro'
  detalhe: string
}

export const CRITERIOS_SAUDE: { rotulo: string; regra: string }[] = [
  { rotulo: 'Checklist (média 30 dias)', regra: 'verde ≥ 80%; amarelo 60–79% ou sem checklist no período; vermelho < 60%. Score recalculado pelas respostas.' },
  { rotulo: 'Checklists atrasados', regra: 'verde 0; amarelo 1–2; vermelho 3 ou mais.' },
  { rotulo: 'Última auditoria (180 dias)', regra: 'verde aprovada; vermelho reprovada; amarelo sem auditoria assinada no período.' },
  { rotulo: 'Ações de auditoria atrasadas', regra: 'verde 0; amarelo 1; vermelho 2 ou mais.' },
  { rotulo: 'Chamados com SLA estourado', regra: 'verde 0; amarelo 1; vermelho 2 ou mais (abertos ou em andamento além do SLA da prioridade).' },
  { rotulo: 'Passos combinados atrasados', regra: 'verde 0; amarelo 1; vermelho 2 ou mais.' },
  { rotulo: 'Último contato da franqueadora', regra: 'verde até 45 dias; amarelo depois disso ou sem registro.' },
  { rotulo: 'Resultado', regra: 'vermelho se algum sinal estiver vermelho; amarelo com 2 ou mais sinais amarelos; senão verde. Universidade, manuais e marketing são informativos e não entram na cor.' },
]

const porContagem = (n: number, amarelo: number, vermelho: number): Nivel => (n >= vermelho ? 'vermelho' : n >= amarelo ? 'amarelo' : 'verde')

export function sinaisSaude(r: ResumoUnidade, agoraMs: number): Sinal[] {
  const s: Sinal[] = []
  if (!r.checklist) s.push({ chave: 'ck', rotulo: 'Checklist', nivel: 'neutro', detalhe: 'Sem leitura do checklist.' })
  else if (!r.checklist.aplica) s.push({ chave: 'ck', rotulo: 'Checklist', nivel: 'neutro', detalhe: 'Unidade sem o módulo de checklist.' })
  else {
    const m = r.checklist.media
    s.push({ chave: 'ck', rotulo: 'Checklist (média 30 dias)', nivel: m === null ? 'amarelo' : m >= 80 ? 'verde' : m >= 60 ? 'amarelo' : 'vermelho', detalhe: m === null ? 'Nenhum checklist nos últimos 30 dias.' : `${m}% em ${r.checklist.execucoes} checklist(s).` })
    s.push({ chave: 'ck-atraso', rotulo: 'Checklists atrasados', nivel: porContagem(r.checklist.atrasados, 1, 3), detalhe: `${r.checklist.atrasados} rotina(s) com o período anterior sem execução.` })
  }
  if (!r.auditoria) s.push({ chave: 'au', rotulo: 'Auditoria', nivel: 'neutro', detalhe: 'Sem leitura das auditorias.' })
  else {
    const u = r.auditoria.ultima
    const recente = u && u.dataVisitaMs >= agoraMs - 180 * DIA
    s.push({
      chave: 'au', rotulo: 'Última auditoria',
      nivel: !recente ? 'amarelo' : u.resultado === 'aprovada' ? 'verde' : 'vermelho',
      detalhe: !u ? 'Nenhuma auditoria assinada.' : `${u.resultado === 'aprovada' ? 'Aprovada' : 'Reprovada'} com ${u.score}%${recente ? '' : ' (há mais de 180 dias)'}.`,
    })
    s.push({ chave: 'au-acoes', rotulo: 'Ações de auditoria atrasadas', nivel: porContagem(r.auditoria.acoesAtrasadas, 1, 2), detalhe: `${r.auditoria.acoesAtrasadas} atrasada(s) de ${r.auditoria.acoesAbertas} em aberto.` })
  }
  if (!r.chamados) s.push({ chave: 'ch', rotulo: 'Chamados', nivel: 'neutro', detalhe: 'Sem leitura dos chamados.' })
  else s.push({ chave: 'ch', rotulo: 'Chamados com SLA estourado', nivel: porContagem(r.chamados.slaEstourado, 1, 2), detalhe: `${r.chamados.slaEstourado} de ${r.chamados.abertos} em aberto.` })
  s.push({ chave: 'passos', rotulo: 'Passos combinados atrasados', nivel: porContagem(r.passos.atrasados, 1, 2), detalhe: `${r.passos.atrasados} atrasado(s) de ${r.passos.abertos} em aberto.` })
  const dias = r.ultimoContatoMs ? Math.floor((agoraMs - r.ultimoContatoMs) / DIA) : null
  s.push({ chave: 'contato', rotulo: 'Último contato', nivel: dias !== null && dias <= 45 ? 'verde' : 'amarelo', detalhe: dias === null ? 'Nenhuma visita, reunião ou call registrada.' : `Há ${dias} dia(s).` })
  return s
}

export function saudeDe(sinais: Sinal[]): Nivel {
  if (sinais.some((x) => x.nivel === 'vermelho')) return 'vermelho'
  if (sinais.filter((x) => x.nivel === 'amarelo').length >= 2) return 'amarelo'
  return 'verde'
}

export const ROTULO_NIVEL: Record<Nivel, string> = { verde: 'Saudável', amarelo: 'Atenção', vermelho: 'Crítica' }

// ---------- Registros e passos ----------

export interface PassoForm { descricao: string; responsavel: string; prazo: string }
export interface RegistroForm { tipo: TipoRegistro; data: string; notas: string; compartilhado: boolean; geradoPorIA: boolean; iaModelo: string; passos: PassoForm[] }

export function validarRegistro(f: RegistroForm): string[] {
  const erros: string[] = []
  if (!f.data) erros.push('Informe a data.')
  if (f.notas.trim().length < 2 || f.notas.length > 4000) erros.push('Escreva as notas (até 4000 caracteres).')
  if (f.geradoPorIA && f.iaModelo.trim().length < 2) erros.push('Informe qual IA ou modelo ajudou nas notas.')
  f.passos.forEach((p, i) => {
    if (p.descricao.trim().length < 2) erros.push(`Passo ${i + 1}: descreva o combinado.`)
    if (p.responsavel.trim().length < 2) erros.push(`Passo ${i + 1}: informe o responsável.`)
    if (!p.prazo) erros.push(`Passo ${i + 1}: informe o prazo.`)
  })
  return erros
}

export function podeGerirAcompanhamento(
  usuario: { papel: string; ativo?: boolean; modulosLiberados?: string[] } | null | undefined,
  ehAdmin: boolean,
): boolean {
  if (!usuario) return false
  if (ehAdmin) return true
  return usuario.papel === 'equipe_franqueadora' && usuario.ativo !== false && (usuario.modulosLiberados ?? []).includes('acompanhamento')
}
