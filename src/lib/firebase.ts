import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { resolveFirebaseConfig } from '../firebaseConfig'
import { deveInicializarFirebase } from './backend'

const resolved = resolveFirebaseConfig()
const iniciar = deveInicializarFirebase() && resolved.configured

export const firebaseConfigured = resolved.configured

export const firebaseApp: FirebaseApp | null = iniciar ? initializeApp(resolved.config) : null
export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null
export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null

if (firebaseApp && auth && db && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

const APPCHECK_SITE_KEY =
  import.meta.env.VITE_APPCHECK_SITE_KEY?.trim() || '6Ldo4B8uAAAAACE-UJ9wwSs9GittnvvbBKi1Jq7R'

if (iniciar && firebaseApp && APPCHECK_SITE_KEY && typeof window !== 'undefined') {
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}


const APP_AI = 'ubox-ai'
let appAi: FirebaseApp | null | undefined

/**
 * App mínimo só para o AI Logic (Gemini). Não inicializa Auth nem Firestore.
 * É preguiçoso: não roda no carregamento de /entrar, só quando a IA é pedida.
 * No backend firebase reutiliza o app padrão (já com App Check, se houver).
 */
export function obterAppParaAi(): FirebaseApp | null {
  if (firebaseApp) return firebaseApp
  if (appAi !== undefined) return appAi
  if (!resolved.configured) {
    appAi = null
    return null
  }
  if (typeof window === 'undefined') return null
  try {
    const existente = getApps().find((app) => app.name === APP_AI)
    const app = existente ?? initializeApp(resolved.config, APP_AI)
    if (APPCHECK_SITE_KEY) {
      try {
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(APPCHECK_SITE_KEY),
          isTokenAutoRefreshEnabled: true,
        })
      } catch {
        // App Check já inicializado neste app (HMR ou segunda chamada).
      }
    }
    appAi = app
    return app
  } catch {
    appAi = null
    return null
  }
}

export function requireDb(): Firestore {
  if (!db) throw new Error('Configuração do Firebase pendente')
  return db
}

export function requireAuth(): Auth {
  if (!auth) throw new Error('Configuração do Firebase pendente')
  return auth
}
