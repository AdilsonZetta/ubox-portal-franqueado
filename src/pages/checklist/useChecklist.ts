import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { fazChecklist, inicioHistoricoVigencias, modeloServeUnidade, podeGerirChecklist, type ExecucaoChecklist, type ModeloChecklist, type VigenciaChecklist } from '../../lib/checklist'
import { listarExecucoes, listarModelos, listarVigencias, VIGENCIA_DISPONIVEL, type ConsultaExecucoes } from '../../lib/checklistApi'
import { useVisao } from '../../lib/visao'
import type { Usuario } from '../../types'

export function useRelogioChecklist() {
  const [agora, setAgora] = useState(Date.now)
  useEffect(() => {
    const intervalo = window.setInterval(() => setAgora(Date.now()), 30_000)
    return () => window.clearInterval(intervalo)
  }, [])
  return agora
}

export interface DadosChecklist {
  pessoa: Usuario | null
  gestor: boolean
  participa: boolean
  simulando: boolean
  modelos: ModeloChecklist[]
  execucoes: ExecucaoChecklist[]
  vigencias: VigenciaChecklist[]
  erroVigencias: string
  carregando: boolean
  erro: string
  recarregar: () => void
}

/** Modelos e execuções visíveis para quem está usando. Na simulação, o admin lê como a unidade simulada veria. */
export function useChecklist(consulta: ConsultaExecucoes = {}, calcularSituacao = false): DadosChecklist {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const gestor = podeGerirChecklist(user, ehAdmin) && !comoFranqueado
  const participa = fazChecklist(pessoa)
  const [modelos, setModelos] = useState<ModeloChecklist[]>([])
  const [execucoes, setExecucoes] = useState<ExecucaoChecklist[]>([])
  const [vigencias, setVigencias] = useState<VigenciaChecklist[]>([])
  const [erroVigencias, setErroVigencias] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])
  const { unidadeId, deMs, ateMs, maximo } = consulta

  useEffect(() => {
    if (!user || !pessoa) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    setErro('')
    const simulando = comoFranqueado
    const unidadeSimulada = pessoa.unidadeId ?? ''
    const comoGestor = gestor || simulando
    if (!comoGestor && !participa) {
      setCarregando(false)
      return
    }
    setErroVigencias('')
    const modelosVisiveis = listarModelos(pessoa, comoGestor).then((lista) =>
      simulando ? lista.filter((m) => modeloServeUnidade(m, unidadeSimulada)) : lista)
    const vigenciasVisiveis = (simulando && !unidadeSimulada ? Promise.resolve([]) :
      listarVigencias(pessoa, comoGestor, simulando ? unidadeSimulada : undefined))
      .catch((falha) => {
        if (ativo) setErroVigencias(mensagemErro(falha))
        return []
      })
    const consultarExecucoes = (desde = deMs, limite = maximo) => listarExecucoes(pessoa, comoGestor, {
      unidadeId: simulando ? unidadeSimulada : unidadeId, deMs: desde, ateMs, maximo: limite,
    })
    const execucoesVisiveis = calcularSituacao && VIGENCIA_DISPONIVEL && deMs != null
      ? Promise.all([modelosVisiveis, vigenciasVisiveis]).then(([m, v]) =>
          consultarExecucoes(inicioHistoricoVigencias(v, m, Date.now(), deMs), v.length ? Infinity : maximo))
      : consultarExecucoes()
    void Promise.all([modelosVisiveis, execucoesVisiveis, vigenciasVisiveis])
      .then(([m, e, v]) => {
        if (!ativo) return
        setModelos(m)
        setVigencias(v)
        setExecucoes(e)
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, pessoa, gestor, participa, ehAdmin, comoFranqueado, unidadeId, deMs, ateMs, maximo, calcularSituacao, tique])

  return { pessoa, gestor, participa, simulando: comoFranqueado, modelos, execucoes, vigencias, erroVigencias, carregando, erro, recarregar }
}
