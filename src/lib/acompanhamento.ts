// Módulo 9: Acompanhamento do Franqueado. Lógica pura (sem Firebase), testada no Vitest.
import { calcularTotais, modeloServeUnidade, situacaoModelo, vigenciaDe, type VigenciaChecklist, type ModeloChecklist, type Resposta } from './checklist'
import { acaoAtrasada, type StatusAcao } from './auditoria'
import { calcularPrazoChamado, type EntradaPrazo } from '../data/chamados'

const DIA = 86_400_000

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
export interface FonteChamado extends EntradaPrazo { unidadeId: string }
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

export type EstadoFonte = 'com_dados' | 'vazia' | 'falhou'

export const ROTULO_FONTE: Record<keyof Fontes, string> = {
  modelosChecklist: 'Modelos de checklist',
  execucoes: 'Execuções de checklist',
  auditorias: 'Auditorias',
  acoes: 'Ações de auditoria',
  chamados: 'Chamados',
  tentativas: 'Provas da Universidade',
  cursosPublicados: 'Cursos publicados',
  progresso: 'Progresso nos manuais',
  trilhaManuais: 'Trilha de manuais',
  pedidos: 'Pedidos de marketing',
  registros: 'Visitas e reuniões',
  passos: 'Passos combinados',
}

const CHAVES_FONTES = Object.keys(ROTULO_FONTE) as (keyof Fontes)[]

export function estadoDasFontes(fontes: Fontes, unidadeId?: string): Record<keyof Fontes, EstadoFonte> {
  const estado = (chave: keyof Fontes): EstadoFonte => {
    const fonte = fontes[chave]
    if (fonte === null) return 'falhou'
    if (typeof fonte === 'number') return fonte > 0 ? 'com_dados' : 'vazia'
    const temDados = unidadeId === undefined
      ? fonte.length > 0
      : fonte.some((item) => 'unidadeId' in item ? item.unidadeId === unidadeId : modeloServeUnidade(item, unidadeId))
    return temDados ? 'com_dados' : 'vazia'
  }
  return Object.fromEntries(CHAVES_FONTES.map((chave) => [chave, estado(chave)])) as Record<keyof Fontes, EstadoFonte>
}

export function fontesIndisponiveis(estados: ReturnType<typeof estadoDasFontes>): (keyof Fontes)[] {
  return CHAVES_FONTES.filter((chave) => estados[chave] === 'falhou')
}

export interface ResumoUnidade {
  estados: ReturnType<typeof estadoDasFontes>
  checklist: { aplica: boolean; media: number | null; execucoes: number | null; atrasados: number | null }
  auditoria: { ultima: FonteAuditoria | null; acoes: { abertas: number; atrasadas: number; paraValidar: number } | null }
  chamados: { abertos: number; slaEstourado: number; aguardandoUnidade: number } | null
  universidade: { pessoas: number; certificados: number; pendentes: number; cursosPublicados: number | null } | null
  manuais: { pessoas: number; concluidos: number; emAndamento: number; trilha: number | null; percentual: number | null } | null
  marketing: { abertos: number; aguardandoUnidade: number; entregues: number } | null
  passos: { abertos: number; atrasados: number; paraValidar: number } | null
  contatoDisponivel: boolean
  ultimoContatoMs: number | null
}

const STATUS_CHAMADO_ABERTO = ['aberto', 'em_andamento', 'aguardando_franqueado']

export function slaEstourado(c: FonteChamado, agoraMs: number): boolean {
  return calcularPrazoChamado(c, agoraMs).atrasado
}

export function passoAtrasado(p: Pick<PassoAc, 'status' | 'prazoMs'>, agoraMs: number): boolean {
  return acaoAtrasada({ prazoMs: p.prazoMs, status: p.status === 'aberto' ? 'aberta' : p.status === 'reaberto' ? 'reaberta' : 'validada' }, agoraMs)
}

/** Agrega o que a franqueadora consegue ler sobre uma unidade. `null` = fonte sem leitura (mostrada como indisponível). */
export function resumirUnidade(
  unidade: { id: string; modulosLiberados: string[] },
  f: Fontes,
  agoraMs: number,
  vigenciasChecklist: VigenciaChecklist[] = [],
): ResumoUnidade {
  const da = <T extends { unidadeId: string }>(l: T[] | null) => (l ? l.filter((x) => x.unidadeId === unidade.id) : null)

  const aplica = unidade.modulosLiberados.includes('checklist')
  const execs = da(f.execucoes)
  const recentes = execs?.filter((e) => e.criadoEmMs >= agoraMs - 30 * DIA)
  const scores = recentes?.map((e) => calcularTotais(e.respostas).score)
  const checklist = {
    aplica,
    media: scores?.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
    execucoes: recentes?.length ?? null,
    atrasados: !aplica ? 0 : execs && f.modelosChecklist
      ? f.modelosChecklist.filter((m) => modeloServeUnidade(m, unidade.id) && situacaoModelo(m, execs, agoraMs, vigenciaDe(vigenciasChecklist, m.id, unidade.id)).situacao === 'atrasado').length
      : null,
  }

  const auds = da(f.auditorias)
  const acoes = da(f.acoes)
  const assinadas = auds?.filter((a) => a.status !== 'rascunho').sort((a, b) => b.dataVisitaMs - a.dataVisitaMs)
  const auditoria = {
    ultima: assinadas?.[0] ?? null,
    acoes: acoes ? {
      abertas: acoes.filter((a) => ['aberta', 'em_andamento', 'reaberta'].includes(a.status)).length,
      atrasadas: acoes.filter((a) => acaoAtrasada(a, agoraMs)).length,
      paraValidar: acoes.filter((a) => a.status === 'concluida_unidade').length,
    } : null,
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

  const passosUn = da(f.passos)
  const regs = da(f.registros)
  return {
    estados: estadoDasFontes(f, unidade.id),
    checklist,
    auditoria,
    chamados,
    universidade,
    manuais,
    marketing,
    passos: passosUn ? {
      abertos: passosUn.filter((p) => p.status === 'aberto' || p.status === 'reaberto').length,
      atrasados: passosUn.filter((p) => passoAtrasado(p, agoraMs)).length,
      paraValidar: passosUn.filter((p) => p.status === 'concluido_unidade').length,
    } : null,
    contatoDisponivel: regs !== null,
    ultimoContatoMs: regs?.length ? Math.max(...regs.map((r) => r.dataMs)) : null,
  }
}

// ---------- Saúde da unidade ----------

export type Nivel = 'verde' | 'amarelo' | 'vermelho'
export type Classificacao = Nivel | 'insuficiente'

export interface Sinal {
  chave: string
  rotulo: string
  nivel: Nivel | 'neutro' | 'indisponivel'
  fontes?: (keyof Fontes)[]
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
  { rotulo: 'Resultado', regra: 'Crítica com qualquer sinal vermelho. Atenção com 2 ou mais sinais amarelos confirmados. Nos demais casos, Dados insuficientes se algum sinal de saúde estiver indisponível ou nenhum puder ser avaliado. Saudável nos outros casos. Universidade, manuais e marketing são informativos.' },
]

const porContagem = (n: number, amarelo: number, vermelho: number): Nivel => (n >= vermelho ? 'vermelho' : n >= amarelo ? 'amarelo' : 'verde')

export function sinaisSaude(r: ResumoUnidade, agoraMs: number): Sinal[] {
  const s: Sinal[] = []
  const indisponivel = (chave: string, rotulo: string, ...fontes: (keyof Fontes)[]): Sinal => ({
    chave, rotulo, fontes, nivel: 'indisponivel',
    detalhe: fontes.length === 1
      ? `Dados indisponíveis: a consulta de ${ROTULO_FONTE[fontes[0]]} falhou.`
      : `Dados indisponíveis: as consultas de ${fontes.map((fonte) => ROTULO_FONTE[fonte]).join(' e ')} falharam.`,
  })

  if (!r.checklist.aplica) s.push({ chave: 'ck', rotulo: 'Checklist', nivel: 'neutro', detalhe: 'Unidade sem o módulo de checklist.' })
  else {
    const m = r.checklist.media
    const rotuloMedia = 'Checklist (média 30 dias)'
    const rotuloAtraso = 'Checklists atrasados'
    s.push(r.estados.execucoes === 'falhou'
      ? indisponivel('ck', rotuloMedia, 'execucoes')
      : { chave: 'ck', rotulo: rotuloMedia, nivel: m === null ? 'amarelo' : m >= 80 ? 'verde' : m >= 60 ? 'amarelo' : 'vermelho', detalhe: m === null ? 'Nenhum checklist nos últimos 30 dias.' : `${m}% em ${r.checklist.execucoes} checklist(s).` })
    const atrasados = r.checklist.atrasados
    s.push(atrasados === null
      ? indisponivel('ck-atraso', rotuloAtraso, ...fontesIndisponiveis(r.estados).filter((fonte) => fonte === 'modelosChecklist' || fonte === 'execucoes'))
      : { chave: 'ck-atraso', rotulo: rotuloAtraso, nivel: porContagem(atrasados, 1, 3), detalhe: `${atrasados} rotina(s) com o período anterior sem execução.` })
  }
  if (r.estados.auditorias === 'falhou') s.push(indisponivel('au', 'Última auditoria', 'auditorias'))
  else {
    const u = r.auditoria.ultima
    const recente = u && u.dataVisitaMs >= agoraMs - 180 * DIA
    s.push({
      chave: 'au', rotulo: 'Última auditoria',
      nivel: !recente ? 'amarelo' : u.resultado === 'aprovada' ? 'verde' : 'vermelho',
      detalhe: !u ? 'Nenhuma auditoria assinada.' : `${u.resultado === 'aprovada' ? 'Aprovada' : 'Reprovada'} com ${u.score}%${recente ? '' : ' (há mais de 180 dias)'}.`,
    })
  }
  const acoes = r.auditoria.acoes
  s.push(acoes
    ? { chave: 'au-acoes', rotulo: 'Ações de auditoria atrasadas', nivel: porContagem(acoes.atrasadas, 1, 2), detalhe: `${acoes.atrasadas} atrasada(s) de ${acoes.abertas} em aberto.` }
    : indisponivel('au-acoes', 'Ações de auditoria atrasadas', 'acoes'))
  s.push(r.chamados
    ? { chave: 'ch', rotulo: 'Chamados com SLA estourado', nivel: porContagem(r.chamados.slaEstourado, 1, 2), detalhe: `${r.chamados.slaEstourado} de ${r.chamados.abertos} em aberto.` }
    : indisponivel('ch', 'Chamados com SLA estourado', 'chamados'))
  s.push(r.passos
    ? { chave: 'passos', rotulo: 'Passos combinados atrasados', nivel: porContagem(r.passos.atrasados, 1, 2), detalhe: `${r.passos.atrasados} atrasado(s) de ${r.passos.abertos} em aberto.` }
    : indisponivel('passos', 'Passos combinados atrasados', 'passos'))
  const dias = r.ultimoContatoMs === null ? null : Math.floor((agoraMs - r.ultimoContatoMs) / DIA)
  s.push(r.contatoDisponivel
    ? { chave: 'contato', rotulo: 'Último contato', nivel: dias !== null && dias <= 45 ? 'verde' : 'amarelo', detalhe: dias === null ? 'Nenhuma visita, reunião ou call registrada.' : `Há ${dias} dia(s).` }
    : indisponivel('contato', 'Último contato', 'registros'))
  return s
}

export function motivoSaude(sinais: Sinal[]) {
  const indisponiveis = sinais.filter((s) => s.nivel === 'indisponivel')
  return {
    riscosConfirmados: sinais.filter((s) => s.nivel === 'vermelho' || s.nivel === 'amarelo'),
    sinaisIndisponiveis: indisponiveis.map((s) => s.rotulo),
    fontesIndisponiveis: [...new Set(indisponiveis.flatMap((s) => s.fontes ?? []))].map((fonte) => ROTULO_FONTE[fonte]),
  }
}

export function saudeDe(sinais: Sinal[]): Classificacao {
  if (sinais.some((s) => s.nivel === 'vermelho')) return 'vermelho'
  const amarelos = sinais.filter((s) => s.nivel === 'amarelo').length
  if (amarelos >= 2) return 'amarelo'
  if (sinais.some((s) => s.nivel === 'indisponivel') || (!amarelos && !sinais.some((s) => s.nivel === 'verde'))) return 'insuficiente'
  return 'verde'
}

export const ROTULO_NIVEL: Record<Nivel, string> = { verde: 'Saudável', amarelo: 'Atenção', vermelho: 'Crítica' }
export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = { ...ROTULO_NIVEL, insuficiente: 'Dados insuficientes' }
export const ORDEM_CLASSIFICACAO: readonly Classificacao[] = ['vermelho', 'insuficiente', 'amarelo', 'verde']

export function contarClassificacoes(classificacoes: Classificacao[]): Record<Classificacao, number> {
  const contagem = { verde: 0, amarelo: 0, vermelho: 0, insuficiente: 0 }
  for (const classificacao of classificacoes) contagem[classificacao] += 1
  return contagem
}

// ---------- Registros e passos ----------

export interface PassoForm { descricao: string; responsavel: string; prazo: string }
export interface RegistroForm { tipo: TipoRegistro; data: string; notas: string; compartilhado: boolean; geradoPorIA: boolean; iaModelo: string; passos: PassoForm[] }

function dataValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number(valor.slice(0, 4)) < 100) return false
  const data = new Date(valor + 'T12:00:00Z')
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor
}

export function validarRegistro(f: RegistroForm): string[] {
  const erros: string[] = []
  if (!dataValida(f.data)) erros.push('Informe uma data válida.')
  if (f.notas.trim().length < 2 || f.notas.length > 4000) erros.push('Escreva as notas (até 4000 caracteres).')
  if (f.geradoPorIA && f.iaModelo.trim().length < 2) erros.push('Informe qual IA ou modelo ajudou nas notas.')
  f.passos.forEach((p, i) => {
    if (p.descricao.trim().length < 2) erros.push(`Passo ${i + 1}: descreva o combinado.`)
    if (p.responsavel.trim().length < 2) erros.push(`Passo ${i + 1}: informe o responsável.`)
    if (!dataValida(p.prazo)) erros.push(`Passo ${i + 1}: informe um prazo válido.`)
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
