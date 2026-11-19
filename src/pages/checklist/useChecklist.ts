import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { fazChecklist, modeloServeUnidade, podeGerirChecklist, type ExecucaoChecklist, type ModeloChecklist } from '../../lib/checklist'
import { listarExecucoes, listarModelos, type ConsultaExecucoes } from '../../lib/checklistApi'
import { useVisao } from '../../lib/visao'
import type { Usuario } from '../../types'

export interface DadosChecklist {
  pessoa: Usuario | null
  gestor: boolean
  participa: boolean
  simulando: boolean
  modelos: ModeloChecklist[]
  execucoes: ExecucaoChecklist[]
  carregando: boolean
  erro: string
  recarregar: () => void
}

/** Modelos e execuções visíveis para quem está usando. Na simulação, o admin lê como a unidade simulada veria. */
export function useChecklist(consulta: ConsultaExecucoes = {}): DadosChecklist {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const gestor = podeGerirChecklist(user, ehAdmin) && !comoFranqueado
  const participa = fazChecklist(pessoa)
  const [modelos, setModelos] = useState<ModeloChecklist[]>([])
  const [execucoes, setExecucoes] = useState<ExecucaoChecklist[]>([])
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
    void Promise.all([
      listarModelos(pessoa, comoGestor),
      listarExecucoes(pessoa, comoGestor, simulando ? { unidadeId: unidadeSimulada, deMs, ateMs, maximo } : { unidadeId, deMs, ateMs, maximo }),
    ])
      .then(([m, e]) => {
        if (!ativo) return
        setModelos(simulando ? m.filter((x) => modeloServeUnidade(x, unidadeSimulada)) : m)
        setExecucoes(e)
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, pessoa, gestor, participa, ehAdmin, comoFranqueado, unidadeId, deMs, ateMs, maximo, tique])

  return { pessoa, gestor, participa, simulando: comoFranqueado, modelos, execucoes, carregando, erro, recarregar }
}
