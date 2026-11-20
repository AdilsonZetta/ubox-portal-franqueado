// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile, type User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { mapUsuario } from './api'
import { BACKEND } from './backend'
import { requireAuth, requireDb } from './firebase'
import { tratarLinkSenha } from './linkSenha'
import { concluirRecuperacao, iniciarRecuperacao, limparRecuperacao, restaurarRecuperacao } from './marcadorRecuperacao'
import { requireSupabase } from './supabase'
import { cadastrarSupabase, carregarEstado, definirNovaSenha, entrarSupabase, gravarPerfilProprio, recuperarSupabase, sairSupabase } from './supabaseAuth'
import type { Usuario } from '../types'

export type StatusAuth = 'loading' | 'signedOut' | 'incomplete' | 'pending' | 'rejected' | 'ready' | 'error'

interface AuthValue {
  status: StatusAuth
  user: Usuario | null
  firebaseUser: User | null
  /** Nome do login (Firebase displayName ou metadado do Supabase), para a tela de completar cadastro. */
  nomeSugerido: string
  /** Supabase: a pessoa chegou pelo link de redefinição e precisa escolher a nova senha. */
  recuperandoSenha: boolean
  linkSenhaInvalido: boolean
  definirSenha: (senha: string) => Promise<void>
  erro: string
  refresh: () => Promise<void>
  entrar: (email: string, senha: string) => Promise<void>
  cadastrar: (dados: { nome: string; email: string; senha: string; unidade: string; cidade: string }) => Promise<void>
  completarCadastro: (dados: { nome: string; unidade: string; cidade: string }) => Promise<void>
  recuperar: (email: string) => Promise<void>
  sair: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

// Uma verificação por abertura do app, inclusive com StrictMode.
const linkSenhaInicial = BACKEND === 'supabase' && typeof window !== 'undefined'
  ? tratarLinkSenha(window, requireSupabase).then(resultado => {
    if (resultado === 'recuperacao') iniciarRecuperacao()
    return resultado
  })
  : undefined

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusAuth>('loading')
  const [user, setUser] = useState<Usuario | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [nomeSupabase, setNomeSupabase] = useState('')
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)
  const [resultadoLinkSenha, setResultadoLinkSenha] = useState<Awaited<typeof linkSenhaInicial>>()
  const verificandoLinkSenha = linkSenhaInicial !== undefined && resultadoLinkSenha === undefined
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0)
  const sessaoInicialVerificada = useRef(false)

  useEffect(() => {
    if (!linkSenhaInicial) return
    let vivo = true
    void linkSenhaInicial.then((resultado) => {
      if (!vivo) return
      if (resultado === 'recuperacao') setRecuperandoSenha(true)
      setResultadoLinkSenha(resultado)
    })
    return () => { vivo = false }
  }, [])

  // Backend Supabase (migração, atrás de VITE_BACKEND=supabase).
  useEffect(() => {
    if (BACKEND !== 'supabase') return
    const sb = requireSupabase()
    let vivo = true
    const aplicar = (sessao: Parameters<typeof carregarEstado>[0] | null) => {
      if (!sessao) {
        setUser(null)
        setStatus('signedOut')
        return
      }
      setStatus('loading')
      void carregarEstado(sessao)
        .then((estado) => {
          if (!vivo) return
          setUser(estado.user)
          setNomeSupabase(estado.nomeSugerido)
          setStatus(estado.status)
        })
        .catch((falha: unknown) => {
          if (!vivo) return
          setErro(falha instanceof Error ? falha.message : 'Falha ao carregar o perfil.')
          setStatus('error')
        })
    }
    const { data: assinatura } = sb.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'INITIAL_SESSION' && !sessaoInicialVerificada.current) {
        sessaoInicialVerificada.current = true
        setRecuperandoSenha(restaurarRecuperacao(sessao))
      }
      if (evento === 'PASSWORD_RECOVERY') {
        iniciarRecuperacao()
        setRecuperandoSenha(true)
      }
      if (evento === 'SIGNED_OUT') {
        limparRecuperacao()
        setRecuperandoSenha(false)
      }
      if (evento === 'INITIAL_SESSION' || evento === 'PASSWORD_RECOVERY' ||
          evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        setTimeout(() => vivo && aplicar(sessao), 0)
      }
    })
    return () => {
      vivo = false
      assinatura.subscription.unsubscribe()
    }
  }, [versao])

  useEffect(() => {
    if (BACKEND !== 'firebase') return
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
          if (perfil.recusado) {
            setStatus('rejected')
            return
          }
          if (!perfil.ativo) {
            setStatus('pending')
            return
          }
          if (perfil.papel === 'franqueado' || perfil.papel === 'equipe_franqueado') {
            if (!perfil.unidadeId) {
              setStatus('pending')
              return
            }
            void getDoc(doc(requireDb(), 'unidades', perfil.unidadeId))
              .then((unidade) => {
                if (!unidade.exists() || unidade.data().ativo !== true) setStatus('pending')
                else setStatus('ready')
              })
              .catch(() => setStatus('pending'))
            return
          }
          setStatus('ready')
        })
        .catch((falha: unknown) => {
          setErro(falha instanceof Error ? falha.message : 'Falha ao carregar o perfil.')
          setStatus('error')
        })
    })
  }, [versao])

  const valor = useMemo<AuthValue>(
    () => ({
      status: verificandoLinkSenha ? 'loading' : status,
      user,
      firebaseUser,
      nomeSugerido: BACKEND === 'supabase' ? nomeSupabase : firebaseUser?.displayName ?? '',
      recuperandoSenha,
      linkSenhaInvalido: resultadoLinkSenha === 'invalido',
      definirSenha: async (senha) => {
        await definirNovaSenha(senha)
        const { data: { session } } = await requireSupabase().auth.getSession()
        concluirRecuperacao(session)
        setRecuperandoSenha(false)
      },
      erro,
      refresh: async () => setVersao((atual) => atual + 1),
      entrar: async (email, senha) => {
        if (BACKEND === 'supabase') return entrarSupabase(email, senha)
        await signInWithEmailAndPassword(requireAuth(), email.trim(), senha)
      },
      cadastrar: async ({ nome, email, senha, unidade, cidade }) => {
        if (BACKEND === 'supabase') {
          await cadastrarSupabase({ nome, email, senha, unidade, cidade })
          setVersao((atual) => atual + 1)
          return
        }
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
          modulosLiberados: [],
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        })
        setVersao((atual) => atual + 1)
      },
      completarCadastro: async ({ nome, unidade, cidade }) => {
        if (BACKEND === 'supabase') {
          await gravarPerfilProprio({ nome, unidade, cidade })
          setVersao((atual) => atual + 1)
          return
        }
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
          modulosLiberados: [],
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp(),
        })
        setVersao((atual) => atual + 1)
      },
      recuperar: async (email) => {
        if (BACKEND === 'supabase') return recuperarSupabase(email)
        await sendPasswordResetEmail(requireAuth(), email.trim())
      },
      sair: async () => {
        if (BACKEND === 'supabase') {
          await sairSupabase()
          limparRecuperacao()
          setRecuperandoSenha(false)
          return
        }
        await signOut(requireAuth())
      },
    }),
    [status, user, firebaseUser, nomeSupabase, recuperandoSenha, resultadoLinkSenha, verificandoLinkSenha, erro],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const valor = useContext(AuthContext)
  if (!valor) throw new Error('useAuth fora do provedor')
  return valor
}
