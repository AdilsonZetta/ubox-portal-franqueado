import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { resolveFirebaseConfig } from '../firebaseConfig'

const resolved = resolveFirebaseConfig()

export const firebaseConfigured = resolved.configured

export const firebaseApp: FirebaseApp | null = resolved.configured ? initializeApp(resolved.config) : null
export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null
export const db: Firestore | null = firebaseApp ? getFirestore(firebaseApp) : null

if (firebaseApp && auth && db && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}

if (firebaseApp && import.meta.env.VITE_APPCHECK_SITE_KEY?.trim()) {
  const siteKey = import.meta.env.VITE_APPCHECK_SITE_KEY.trim()
  void import('firebase/app-check').then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
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
