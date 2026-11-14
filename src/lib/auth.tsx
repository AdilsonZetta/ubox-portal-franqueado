import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile, type User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { mapUsuario } from './api'
import { requireAuth, requireDb } from './firebase'
import type { Usuario } from '../types'

export type StatusAuth = 'loading' | 'signedOut' | 'incomplete' | 'pending' | 'rejected' | 'ready' | 'error'

interface AuthValue {
  status: StatusAuth
  user: Usuario | null
  firebaseUser: User | null
  erro: string
  refresh: () => Promise<void>
  entrar: (email: string, senha: string) => Promise<void>
  cadastrar: (dados: { nome: string; email: string; senha: string; unidade: string; cidade: string }) => Promise<void>
  completarCadastro: (dados: { nome: string; unidade: string; cidade: string }) => Promise<void>
  recuperar: (email: string) => Promise<void>
  sair: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusAuth>('loading')
  const [user, setUser] = useState<Usuario | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    const auth = requireAuth()
    return onAuthStateChanged(auth, (conta) => {
      setFirebaseUser(conta)
      if (!conta) {
        setUser(null)
        setStatus('signedOut')
        return
      }
      setStatus('loading')
      void getDoc(doc(requireDb(), 'usuarios', conta.uid))
        .then((snap) => {
          if (!snap.exists()) {
            setUser(null)
            setStatus('incomplete')
            return
          }
          const perfil = mapUsuario(snap.id, snap.data())
          if (!perfil) {
            setUser(null)
            setStatus('incomplete')
            return
          }
          setUser(perfil)
          if (perfil.recusado) setStatus('rejected')
          else if (!perfil.ativo) setStatus('pending')
          else setStatus('ready')
        })
        .catch((falha: unknown) => {
          setErro(falha instanceof Error ? falha.message : 'Falha ao carregar o perfil.')
          setStatus('error')
        })
    })
  }, [versao])

  const valor = useMemo<AuthValue>(
    () => ({
      status,
      user,
      firebaseUser,
      erro,
      refresh: async () => setVersao((atual) => atual + 1),
      entrar: async (email, senha) => {
        await signInWithEmailAndPassword(requireAuth(), email.trim(), senha)
      },
      cadastrar: async ({ nome, email, senha, unidade, cidade }) => {
        const credencial = await createUserWithEmailAndPassword(requireAuth(), email.trim(), senha)
        await updateProfile(credencial.user, { displayName: nome.trim() })
        await setDoc(doc(requireDb(), 'usuarios', credencial.user.uid), {
          uid: credencial.user.uid,
          email: email.trim(),
          nome: nome.trim(),
          papel: 'franqueado',
          ativo: false,
          recusado: false,
          unidade: unidade.trim(),
          cidade: cidade.trim(),
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        })
        setVersao((atual) => atual + 1)
      },
      completarCadastro: async ({ nome, unidade, cidade }) => {
        const conta = requireAuth().currentUser
        if (!conta?.email) throw new Error('Entre novamente para concluir o cadastro.')
        await setDoc(doc(requireDb(), 'usuarios', conta.uid), {
          uid: conta.uid,
          email: conta.email,
          nome: nome.trim(),
          papel: 'franqueado',
          ativo: false,
          recusado: false,
          unidade: unidade.trim(),
          cidade: cidade.trim(),
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        })
        setVersao((atual) => atual + 1)
      },
      recuperar: async (email) => {
        await sendPasswordResetEmail(requireAuth(), email.trim())
      },
      sair: async () => {
        await signOut(requireAuth())
      },
    }),
    [status, user, firebaseUser, erro],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const valor = useContext(AuthContext)
  if (!valor) throw new Error('useAuth fora do provedor')
  return valor
}
