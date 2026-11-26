import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Audiencia, Documento, Trilha, Usuario } from '../types'
import { listarUsuarios } from './api'
import { useAuth } from './auth'

const CHAVE = 'ubox-visao-franqueado'
const CHAVE_UID = 'ubox-simulado-uid'

interface VisaoValor {
  comoFranqueado: boolean
  ehAdmin: boolean
  simulado: Usuario | null
  unidadeSimulada: string | null
  unidadesSimulaveis: Usuario[]
  carregandoUnidades: boolean
  erroUnidades: boolean
  recarregarUnidades: () => void
  escolher: (uid: string) => void
  alternar: () => void
}

const VisaoContext = createContext<VisaoValor | null>(null)

export function VisaoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [comoFranqueado, setComoFranqueado] = useState(() => localStorage.getItem(CHAVE) === '1')
  const [simuladoUid, setSimuladoUid] = useState(() => localStorage.getItem(CHAVE_UID) || '')
  const [franqueados, setFranqueados] = useState<Usuario[] | null>(null)
  const [erroUnidades, setErroUnidades] = useState(false)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (user && user.papel !== 'admin' && comoFranqueado) setComoFranqueado(false)
  }, [user, comoFranqueado])

  useEffect(() => {
    if (user?.papel !== 'admin') return
    let ativo = true
    void listarUsuarios()
      .then((lista) => {
        if (ativo) setFranqueados(lista.filter((pessoa) => pessoa.papel === 'franqueado' && pessoa.ativo && !pessoa.recusado && pessoa.unidadeId))
      })
      .catch(() => { if (ativo) setErroUnidades(true) })
    return () => { ativo = false }
  }, [user?.papel, user?.uid, tentativa])

  const unidadesSimulaveis = useMemo(() => {
    const porUnidade = new Map<string, Usuario>()
    for (const pessoa of [...(franqueados ?? [])].sort((a, b) => a.uid.localeCompare(b.uid))) {
      if (pessoa.unidadeId && !porUnidade.has(pessoa.unidadeId)) porUnidade.set(pessoa.unidadeId, pessoa)
    }
    return [...porUnidade.values()].sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR'))
  }, [franqueados])
  const unidadeId = franqueados?.find((pessoa) => pessoa.uid === simuladoUid)?.unidadeId
  const simulado = unidadesSimulaveis.find((pessoa) => pessoa.unidadeId === unidadeId) ?? null

  const valor = useMemo<VisaoValor>(() => {
    const ativo = user?.papel === 'admin' && comoFranqueado
    return {
      comoFranqueado: ativo,
      ehAdmin: user?.papel === 'admin' && !ativo,
      simulado: ativo ? simulado : null,
      unidadeSimulada: ativo && simulado ? simulado.unidade || simulado.unidadeId || null : null,
      unidadesSimulaveis,
      carregandoUnidades: franqueados === null && !erroUnidades,
      erroUnidades,
      recarregarUnidades: () => {
        setErroUnidades(false)
        setFranqueados(null)
        setTentativa((t) => t + 1)
      },
      escolher: (uid: string) => {
        setSimuladoUid(uid)
        localStorage.setItem(CHAVE_UID, uid)
      },
      alternar: () => {
        const proximo = user?.papel === 'admin' && !comoFranqueado
        if (proximo) {
          setSimuladoUid('')
          localStorage.removeItem(CHAVE_UID)
        }
        localStorage.setItem(CHAVE, proximo ? '1' : '0')
        setComoFranqueado(proximo)
      },
    }
  }, [comoFranqueado, user?.papel, simulado, franqueados, unidadesSimulaveis, erroUnidades])

  return <VisaoContext.Provider value={valor}>{children}</VisaoContext.Provider>
}

export function useVisao(): VisaoValor {
  const valor = useContext(VisaoContext)
  if (!valor) throw new Error('useVisao fora do provedor')
  return valor
}

export function documentoVisivelAoFranqueado(documento: Documento, usuario: Usuario): boolean {
  if (documento.status !== 'publicado') return false
  if (documento.publico) return true
  return documento.uids.includes(usuario.uid)
}

export function trilhaVisivelAoFranqueado(trilha: Trilha, usuario: Usuario): boolean {
  if (!trilha.publicado) return false
  return audienciaVisivel(trilha, usuario)
}

function audienciaVisivel(item: Audiencia, usuario: Usuario): boolean {
  if (item.publico) return true
  return item.uids.includes(usuario.uid)
}
