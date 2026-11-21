import { initializeApp, type FirebaseApp } from 'firebase/app'
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

export function requireDb(): Firestore {
  if (!db) throw new Error('Configuração do Firebase pendente')
  return db
}

export function requireAuth(): Auth {
  if (!auth) throw new Error('Configuração do Firebase pendente')
  return auth
}
