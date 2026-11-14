import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Audiencia, Documento, Trilha, Usuario } from '../types'
import { useAuth } from './auth'

const CHAVE = 'ubox-visao-franqueado'

interface VisaoValor {
  comoFranqueado: boolean
  ehAdmin: boolean
  alternar: () => void
}

const VisaoContext = createContext<VisaoValor | null>(null)

export function VisaoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [comoFranqueado, setComoFranqueado] = useState(() => localStorage.getItem(CHAVE) === '1')

  useEffect(() => {
    if (user?.papel !== 'admin' && comoFranqueado) setComoFranqueado(false)
  }, [user?.papel, comoFranqueado])

  const valor = useMemo<VisaoValor>(() => {
    const ativo = user?.papel === 'admin' && comoFranqueado
    return {
      comoFranqueado: ativo,
      ehAdmin: user?.papel === 'admin' && !ativo,
      alternar: () => {
        setComoFranqueado((atual) => {
          const proximo = user?.papel === 'admin' ? !atual : false
          localStorage.setItem(CHAVE, proximo ? '1' : '0')
          return proximo
        })
      },
    }
  }, [comoFranqueado, user?.papel])

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
