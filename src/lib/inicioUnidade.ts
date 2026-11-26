import type { Usuario } from '../types'
import {
  fazChecklist, inicioPeriodo, liberacaoChecklist, modeloServeUnidade, situacaoModelo, vigenciaDe,
  type ExecucaoChecklist, type ModeloChecklist, type VigenciaChecklist,
} from './checklist'
import { podeModulo } from './modulosAcesso'

type Acao = 'checklist' | 'chamados' | 'manuais' | 'universidade'

export function acoesPermitidas(pessoa: Usuario | null | undefined, simulando: boolean): Acao[] {
  if (pessoa?.papel !== 'franqueado' && pessoa?.papel !== 'equipe_franqueado') return []
  const acoes: Acao[] = []
  if (pessoa.unidadeId && fazChecklist(pessoa) && podeModulo(pessoa, 'checklist', simulando)) acoes.push('checklist')
  if (podeModulo(pessoa, 'chamados', simulando)) acoes.push('chamados')
  if (podeModulo(pessoa, 'manuais', simulando)) acoes.push('manuais')
  else if (podeModulo(pessoa, 'universidade', simulando)) acoes.push('universidade')
  return acoes
}

export type ModeloInicio = Pick<ModeloChecklist,
  'id' | 'titulo' | 'frequencia' | 'tipo' | 'ativo' | 'publico' | 'unidades' | 'criadoEmMs' | 'horarioLiberacao'>

type RotinaInicio =
  | { estado: 'sem_rotina' }
  | { estado: 'aguardando_inicio'; modelo: ModeloInicio; inicio: string }
  | { estado: 'aguardando_horario'; modelo: ModeloInicio; horario: string }
  | { estado: 'em_dia'; modelo: ModeloInicio; periodoInicial: boolean }
  | { estado: 'pendente' | 'atrasado'; modelo: ModeloInicio }

export function escolherRotina(
  modelos: ModeloInicio[],
  execucoes: Pick<ExecucaoChecklist, 'unidadeId' | 'modeloId' | 'criadoEmMs'>[],
  vigencias: VigenciaChecklist[],
  unidadeId: string,
  agora: Date,
): RotinaInicio {
  const daUnidade = execucoes.filter((e) => e.unidadeId === unidadeId && e.criadoEmMs <= +agora)
  const rotinas = modelos.filter((m) => m.frequencia !== 'avulsa' && modeloServeUnidade(m, unidadeId)).map((modelo) => {
    const vigencia = vigenciaDe(vigencias, modelo.id, unidadeId)
    const situacao = situacaoModelo(modelo, daUnidade, +agora, vigencia)
    const liberacao = liberacaoChecklist(modelo, agora)
    return { modelo, vigencia, situacao, liberacao }
  }).sort((a, b) =>
    Number(b.situacao.situacao === 'atrasado') - Number(a.situacao.situacao === 'atrasado')
    || Number(b.modelo.frequencia === 'diaria') - Number(a.modelo.frequencia === 'diaria')
    || Number(b.modelo.tipo === 'abertura') - Number(a.modelo.tipo === 'abertura')
    || a.modelo.titulo.localeCompare(b.modelo.titulo, 'pt-BR'),
  )
  const pendentes = rotinas.filter(({ situacao }) => !situacao.aguardandoInicio && situacao.situacao !== 'em_dia')
  const escolhida = pendentes.find(({ liberacao }) => liberacao.liberado) ?? pendentes[0]
  if (escolhida) {
    const { modelo, liberacao, situacao } = escolhida
    if (!liberacao.liberado && liberacao.horario) return { estado: 'aguardando_horario', modelo, horario: liberacao.horario }
    return { estado: situacao.situacao === 'atrasado' ? 'atrasado' : 'pendente', modelo }
  }
  const futura = rotinas.filter(({ situacao }) => situacao.aguardandoInicio)
    .sort((a, b) => (a.vigencia?.inicio ?? '').localeCompare(b.vigencia?.inicio ?? ''))[0]
  if (futura?.vigencia) return { estado: 'aguardando_inicio', modelo: futura.modelo, inicio: futura.vigencia.inicio }
  const concluida = rotinas[0]
  if (concluida) {
    const { modelo, situacao } = concluida
    const periodoInicial = modelo.frequencia !== 'avulsa' && situacao.primeiroVencimentoMs !== null
      && inicioPeriodo(modelo.frequencia, +agora) < situacao.primeiroVencimentoMs
    return { estado: 'em_dia', modelo, periodoInicial }
  }
  return { estado: 'sem_rotina' }
}
