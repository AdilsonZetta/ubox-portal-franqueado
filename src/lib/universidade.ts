/**
 * Lógica pura da Universidade UBOX (módulo 5).
 * Sem Firebase aqui: sequência de tentativas, ciclos de reestudo, notas e resumos são testáveis no Vitest.
 * A correção de verdade acontece nas rules (firestore.rules), que leem o gabarito com get().
 */

export const MAX_TENTATIVAS = 3
export const MAX_PERGUNTAS = 20
export const MAX_AULAS = 20
export const MIN_OPCOES = 2
export const MAX_OPCOES = 6
export const REESTUDO_PISO_SEG = 30
export const REESTUDO_TETO_SEG = 14400

export interface Curso {
  id: string
  titulo: string
  descricao: string
  ordem: number
  aulas: string[]
  publicado: boolean
  atualizadoPor?: string
  atualizadoPorNome?: string
  atualizadoEm?: unknown
}

export interface PerguntaProva {
  id: string
  enunciado: string
  opcoes: string[]
}

/** Prova como o aluno recebe: sem nenhuma resposta. */
export interface Prova {
  cursoId: string
  titulo: string
  notaMinima: number
  perguntas: PerguntaProva[]
  totalPerguntas: number
  manualRetornoId: string
  tempoReestudoSeg: number
  versao: number
  publicado: boolean
  atualizadoPorNome?: string
  atualizadoEm?: unknown
}

export interface TentativaProva {
  id: string
  uid: string
  cursoId: string
  ciclo: number
  numero: number
  nome: string
  unidadeId: string
  unidadeNome: string
  versao: number
  aprovado: boolean | null
  criadoEm?: unknown
  corrigidoEm?: unknown
}

export interface Reestudo {
  id: string
  uid: string
  cursoId: string
  ciclo: number
  documentoId: string
  status: 'em_andamento' | 'concluido'
  iniciadoEm?: unknown
  reinicios: number
  concluidoEm?: unknown
}

export function idTentativa(uid: string, cursoId: string, ciclo: number, numero: number): string {
  return `${uid}_${cursoId}_${ciclo}_${numero}`
}

export function idReestudo(uid: string, cursoId: string, ciclo: number): string {
  return `${uid}_${cursoId}_${ciclo}`
}

/** Id do curso: só letras, números e hífen (as rules exigem o mesmo). */
export function slugCurso(titulo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || 'curso'
}

export type EstadoProva =
  | { tipo: 'aprovado'; tentativa: TentativaProva }
  | { tipo: 'corrigindo'; tentativa: TentativaProva }
  | { tipo: 'disponivel'; ciclo: number; numero: number; restantes: number }
  | { tipo: 'reestudo'; ciclo: number; reestudo: Reestudo | null }

/**
 * Onde a pessoa está na prova de um curso.
 * Ciclo = até 3 chances. Reprovou nas 3: volta ao manual (reestudo) e, concluído, abre o ciclo seguinte.
 */
export function estadoDaProva(
  cursoId: string,
  tentativas: Pick<TentativaProva, 'cursoId' | 'ciclo' | 'numero' | 'aprovado' | 'id'>[],
  reestudos: Pick<Reestudo, 'cursoId' | 'ciclo' | 'status' | 'id'>[],
): EstadoProva {
  const minhas = tentativas
    .filter((t) => t.cursoId === cursoId)
    .sort((a, b) => a.ciclo - b.ciclo || a.numero - b.numero) as TentativaProva[]
  const aprovada = minhas.find((t) => t.aprovado === true)
  if (aprovada) return { tipo: 'aprovado', tentativa: aprovada }
  const pendente = minhas.find((t) => t.aprovado === null)
  if (pendente) return { tipo: 'corrigindo', tentativa: pendente }
  const ultima = minhas[minhas.length - 1]
  if (!ultima) return { tipo: 'disponivel', ciclo: 1, numero: 1, restantes: MAX_TENTATIVAS }
  if (ultima.numero < MAX_TENTATIVAS) {
    return { tipo: 'disponivel', ciclo: ultima.ciclo, numero: ultima.numero + 1, restantes: MAX_TENTATIVAS - ultima.numero }
  }
  const reestudo = (reestudos.find((r) => r.cursoId === cursoId && r.ciclo === ultima.ciclo) as Reestudo | undefined) ?? null
  if (reestudo?.status === 'concluido') return { tipo: 'disponivel', ciclo: ultima.ciclo + 1, numero: 1, restantes: MAX_TENTATIVAS }
  return { tipo: 'reestudo', ciclo: ultima.ciclo, reestudo }
}

/** Mesma conta das rules: acertos * 100 >= notaMinima * total. */
export function contarAcertos(respostas: number[], corretas: number[]): number {
  let acertos = 0
  for (let i = 0; i < Math.min(respostas.length, corretas.length); i++) if (respostas[i] === corretas[i]) acertos++
  return acertos
}

export function atingiuNota(acertos: number, total: number, notaMinima: number): boolean {
  return total > 0 && acertos * 100 >= notaMinima * total
}

export function notaPercentual(acertos: number, total: number): number {
  return total ? Math.round((acertos / total) * 100) : 0
}

/** Quantas aulas (manuais) do curso a pessoa já concluiu no módulo de Manuais. */
export function aulasConcluidas(curso: Pick<Curso, 'aulas'>, progressos: { documentoId: string; status: string }[]): number {
  const feitos = new Set(progressos.filter((p) => p.status === 'concluido').map((p) => p.documentoId))
  return curso.aulas.filter((id) => feitos.has(id)).length
}

export function ordenarCursos<T extends Pick<Curso, 'ordem' | 'titulo'>>(cursos: T[]): T[] {
  return [...cursos].sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export function limitarReestudo(segundos: number): number {
  if (!Number.isFinite(segundos)) return REESTUDO_PISO_SEG
  return Math.min(REESTUDO_TETO_SEG, Math.max(REESTUDO_PISO_SEG, Math.round(segundos)))
}

export interface PerguntaEdicao {
  id: string
  enunciado: string
  opcoes: string[]
  correta: number
}

/** Erros que impedem salvar a prova. Lista vazia = pode salvar. */
export function validarProva(dados: { titulo: string; notaMinima: number; manualRetornoId: string; perguntas: PerguntaEdicao[] }): string[] {
  const erros: string[] = []
  if (!dados.titulo.trim()) erros.push('Dê um título para a prova.')
  if (!Number.isInteger(dados.notaMinima) || dados.notaMinima < 1 || dados.notaMinima > 100) erros.push('A nota mínima vai de 1 a 100%.')
  if (!dados.manualRetornoId) erros.push('Escolha o manual para onde a pessoa volta depois de 3 reprovações.')
  if (!dados.perguntas.length) erros.push('Inclua pelo menos uma pergunta.')
  if (dados.perguntas.length > MAX_PERGUNTAS) erros.push(`A prova aceita até ${MAX_PERGUNTAS} perguntas.`)
  dados.perguntas.forEach((p, i) => {
    const n = i + 1
    if (!p.enunciado.trim()) erros.push(`Pergunta ${n}: escreva o enunciado.`)
    const opcoes = p.opcoes.map((o) => o.trim())
    if (opcoes.length < MIN_OPCOES || opcoes.length > MAX_OPCOES) erros.push(`Pergunta ${n}: use de ${MIN_OPCOES} a ${MAX_OPCOES} alternativas.`)
    if (opcoes.some((o) => !o)) erros.push(`Pergunta ${n}: há alternativa em branco.`)
    if (!Number.isInteger(p.correta) || p.correta < 0 || p.correta >= opcoes.length) erros.push(`Pergunta ${n}: marque a alternativa correta.`)
  })
  return erros
}

/** Separa a pergunta pública (sem resposta) do gabarito. */
export function separarGabarito(perguntas: PerguntaEdicao[]): { publicas: PerguntaProva[]; corretas: number[] } {
  return {
    publicas: perguntas.map((p) => ({ id: p.id, enunciado: p.enunciado.trim().slice(0, 600), opcoes: p.opcoes.map((o) => o.trim()) })),
    corretas: perguntas.map((p) => p.correta),
  }
}

export interface ResultadoPessoaCurso {
  cursoId: string
  tentativas: number
  ciclos: number
  aprovado: boolean
  melhorNota: number | null
  aguardandoReestudo: boolean
}

export interface ResultadoPessoa {
  uid: string
  nome: string
  unidadeId: string
  unidadeNome: string
  cursos: ResultadoPessoaCurso[]
  aprovados: number
}

export interface ResultadoUnidade {
  unidadeId: string
  unidadeNome: string
  pessoas: ResultadoPessoa[]
  aprovados: number
  tentativas: number
}

/**
 * Agrupa as tentativas por unidade e pessoa.
 * A nota só aparece para quem tem o gabarito (franqueadora); o franqueado vê aprovado/reprovado.
 */
export function resumirResultados(
  tentativas: TentativaProva[],
  gabaritos: Map<string, number[]> | null,
  folhas: Map<string, number[]> | null = null,
): ResultadoUnidade[] {
  const pessoas = new Map<string, ResultadoPessoa>()
  const porPessoaCurso = new Map<string, TentativaProva[]>()
  for (const t of tentativas) {
    if (!pessoas.has(t.uid)) pessoas.set(t.uid, { uid: t.uid, nome: t.nome, unidadeId: t.unidadeId, unidadeNome: t.unidadeNome, cursos: [], aprovados: 0 })
    const chave = `${t.uid}|${t.cursoId}`
    porPessoaCurso.set(chave, [...(porPessoaCurso.get(chave) ?? []), t])
  }
  for (const [chave, lista] of porPessoaCurso) {
    const [uid, cursoId] = chave.split('|')
    const pessoa = pessoas.get(uid)!
    const aprovado = lista.some((t) => t.aprovado === true)
    const corretas = gabaritos?.get(cursoId)
    const notas = corretas && folhas
      ? lista.filter((t) => folhas.has(t.id)).map((t) => notaPercentual(contarAcertos(folhas.get(t.id)!, corretas), corretas.length))
      : []
    const ultimoCiclo = Math.max(...lista.map((t) => t.ciclo))
    const doUltimo = lista.filter((t) => t.ciclo === ultimoCiclo)
    pessoa.cursos.push({
      cursoId,
      tentativas: lista.length,
      ciclos: ultimoCiclo,
      aprovado,
      melhorNota: notas.length ? Math.max(...notas) : null,
      aguardandoReestudo: !aprovado && doUltimo.length >= MAX_TENTATIVAS && doUltimo.every((t) => t.aprovado === false),
    })
    if (aprovado) pessoa.aprovados++
  }
  const unidades = new Map<string, ResultadoUnidade>()
  for (const pessoa of pessoas.values()) {
    let u = unidades.get(pessoa.unidadeId)
    if (!u) {
      u = { unidadeId: pessoa.unidadeId, unidadeNome: pessoa.unidadeNome || 'Unidade sem nome', pessoas: [], aprovados: 0, tentativas: 0 }
      unidades.set(pessoa.unidadeId, u)
    }
    pessoa.cursos.sort((a, b) => a.cursoId.localeCompare(b.cursoId))
    u.pessoas.push(pessoa)
    u.aprovados += pessoa.aprovados
    u.tentativas += pessoa.cursos.reduce((s, c) => s + c.tentativas, 0)
  }
  return [...unidades.values()]
    .map((u) => ({ ...u, pessoas: u.pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }))
    .sort((a, b) => a.unidadeNome.localeCompare(b.unidadeNome, 'pt-BR'))
}

/** Quem cria cursos e provas e vê o gabarito: admin, ou equipe da franqueadora com o módulo. */
export function podeGerirUniversidade(
  usuario: { papel: string; ativo?: boolean; modulosLiberados?: string[] } | null | undefined,
  ehAdmin: boolean,
): boolean {
  if (!usuario) return false
  if (ehAdmin) return true
  return usuario.papel === 'equipe_franqueadora' && usuario.ativo !== false && (usuario.modulosLiberados ?? []).includes('universidade')
}

/** Quem faz cursos e provas: franqueado e equipe da unidade (as rules exigem esses papéis). */
export function fazUniversidade(usuario: { papel: string } | null | undefined): boolean {
  return usuario?.papel === 'franqueado' || usuario?.papel === 'equipe_franqueado'
}

/** Texto que o aluno vê depois da correção. Nunca inclui a resposta certa. */
export function mensagemResultado(aprovado: boolean, restantes: number, provaAtualizada = false): string {
  if (!aprovado && provaAtualizada) {
    return `A franqueadora atualizou esta prova enquanto você respondia, então esta tentativa não pôde ser corrigida e contou como não aprovada. ${restantes > 0 ? (restantes === 1 ? 'Resta 1 chance' : `Restam ${restantes} chances`) + ' neste ciclo, já na versão nova.' : 'Conclua o reestudo do manual para liberar novas tentativas.'}`
  }
  if (aprovado) return 'Aprovado. Parabéns, você atingiu a nota mínima e o certificado já está liberado.'
  if (restantes > 0) return `Você não atingiu a nota mínima. ${restantes === 1 ? 'Resta 1 chance' : `Restam ${restantes} chances`} neste ciclo. Revise as aulas antes de tentar de novo.`
  return 'Você não atingiu a nota mínima nas 3 chances. Volte ao manual indicado e conclua o reestudo para liberar novas tentativas.'
}
