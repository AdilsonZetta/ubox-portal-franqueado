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
  franqueados: Usuario[]
  escolher: (uid: string) => void
  alternar: () => void
}

const VisaoContext = createContext<VisaoValor | null>(null)

export function VisaoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [comoFranqueado, setComoFranqueado] = useState(() => localStorage.getItem(CHAVE) === '1')
  const [simuladoUid, setSimuladoUid] = useState(() => localStorage.getItem(CHAVE_UID) || '')
  const [franqueados, setFranqueados] = useState<Usuario[]>([])

  useEffect(() => {
    if (user?.papel !== 'admin' && comoFranqueado) setComoFranqueado(false)
  }, [user?.papel, comoFranqueado])

  useEffect(() => {
    if (user?.papel !== 'admin') return
    void listarUsuarios()
      .then((lista) => setFranqueados(lista.filter((pessoa) => pessoa.papel === 'franqueado')))
      .catch(() => setFranqueados([]))
  }, [user?.papel, user?.uid])

  const simulado = franqueados.find((pessoa) => pessoa.uid === simuladoUid) ?? null

  const valor = useMemo<VisaoValor>(() => {
    const ativo = user?.papel === 'admin' && comoFranqueado
    return {
      comoFranqueado: ativo,
      ehAdmin: user?.papel === 'admin' && !ativo,
      simulado: ativo ? simulado : null,
      franqueados,
      escolher: (uid: string) => {
        setSimuladoUid(uid)
        localStorage.setItem(CHAVE_UID, uid)
      },
      alternar: () => {
        setComoFranqueado((atual) => {
          const proximo = user?.papel === 'admin' ? !atual : false
          localStorage.setItem(CHAVE, proximo ? '1' : '0')
          return proximo
        })
      },
    }
  }, [comoFranqueado, user?.papel, simulado, franqueados])

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
