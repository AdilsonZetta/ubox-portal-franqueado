import { deleteApp, initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { createUserWithEmailAndPassword, inMemoryPersistence, initializeAuth, signOut } from 'firebase/auth'
import { resolveFirebaseConfig } from '../firebaseConfig'

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function senhaProvisoria(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const corpo = [...bytes].map((byte) => ALFABETO[byte % ALFABETO.length]).join('')
  return `Ubox-${corpo}`
}

/** Cria o login numa instância separada, sem derrubar a sessão de quem está cadastrando. */
export async function criarLoginSemDeslogar(email: string, senha: string): Promise<string> {
  const { config } = resolveFirebaseConfig()
  const secundario = initializeApp(config, `criacao-${crypto.randomUUID()}`)
  const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY?.trim() || '6Ldo4B8uAAAAACE-UJ9wwSs9GittnvvbBKi1Jq7R'
  if (typeof window !== 'undefined' && siteKey) {
    initializeAppCheck(secundario, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
  }
  const auth = initializeAuth(secundario, { persistence: inMemoryPersistence })
  try {
    const credencial = await createUserWithEmailAndPassword(auth, email.trim(), senha)
    const uid = credencial.user.uid
    await signOut(auth)
    return uid
  } finally {
    await deleteApp(secundario)
  }
}
