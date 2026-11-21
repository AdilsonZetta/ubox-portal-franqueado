import { deleteApp, initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { createUserWithEmailAndPassword, deleteUser, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth'
import { resolveFirebaseConfig } from '../firebaseConfig'
import { deveInicializarFirebase } from './backend'

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function senhaProvisoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const corpo = [...bytes].map((byte) => ALFABETO[byte % ALFABETO.length]).join('')
  return `Ubox-${corpo}`
}

export function erroCadastroIncompleto(motivo: unknown, apagouLogin: boolean): Error {
  const detalhe = motivo instanceof Error && motivo.message ? motivo.message : 'Falha ao gravar o cadastro.'
  const limpeza = apagouLogin
    ? 'O login provisório foi apagado.'
    : 'Não foi possível apagar o login provisório. Use outro e-mail ou peça para remover essa conta antes de tentar de novo.'
  return new Error(`Não foi possível concluir o cadastro. ${limpeza} ${detalhe}`)
}

/** Grava o perfil. Se falhar, apaga o login que ainda está autenticado. */
export async function gravarOuApagarLogin<T>(apagar: () => Promise<void>, gravar: () => Promise<T>): Promise<T> {
  try {
    return await gravar()
  } catch (erro) {
    let apagou = false
    try {
      await apagar()
      apagou = true
    } catch {
      apagou = false
    }
    throw erroCadastroIncompleto(erro, apagou)
  }
}

/**
 * Cria o login numa instância separada e só então grava no Firestore.
 * A sessão de quem está cadastrando permanece. Se a gravação falhar, o login novo é apagado.
 */
export async function criarLoginEGravar<T>(email: string, senha: string, gravar: (uid: string) => Promise<T>): Promise<T> {
  const { config } = resolveFirebaseConfig()
  const secundario = initializeApp(config, `criacao-${crypto.randomUUID()}`)
  const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY?.trim() || '6Ldo4B8uAAAAACE-UJ9wwSs9GittnvvbBKi1Jq7R'
  if (deveInicializarFirebase() && typeof window !== 'undefined' && siteKey) {
    initializeAppCheck(secundario, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
  }
  const auth = initializeAuth(secundario, { persistence: inMemoryPersistence })
  try {
    const credencial = await createUserWithEmailAndPassword(auth, email.trim(), senha)
    const resultado = await gravarOuApagarLogin(
      () => deleteUser(credencial.user),
      () => gravar(credencial.user.uid),
    )
    await signOut(auth).catch(() => undefined)
    return resultado
  } finally {
    await deleteApp(secundario).catch(() => undefined)
  }
}
