/**
 * Configuração pública do app web Firebase.
 * Estes valores não são segredo: o bundle do Pages já os expõe.
 * Quem protege os dados são as regras do Firestore.
 * Variáveis VITE_FIREBASE_* substituem o fallback quando não estão vazias.
 */
export const firebaseConfigFallback = {
  apiKey: 'AIzaSyD6jSnC995o_0EjNW5B1QEKIRyYP04gimU',
  authDomain: 'ubox-portal-franqueado.firebaseapp.com',
  projectId: 'ubox-portal-franqueado',
  storageBucket: 'ubox-portal-franqueado.firebasestorage.app',
  messagingSenderId: '760141352000',
  appId: '1:760141352000:web:706f3cedde9fa1ed6be3a5',
  measurementId: '',
}

export interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

function limpar(valor: string | undefined): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

function escolher(env: string | undefined, fallback: string): string {
  const doEnv = limpar(env)
  return doEnv || fallback
}

export function isFirebaseConfigured(config: FirebaseWebConfig): boolean {
  const campos = [config.apiKey, config.projectId, config.appId]
  return campos.every((valor) => {
    if (!valor) return false
    if (valor.includes('COLOQUE')) return false
    return true
  })
}

export function resolveFirebaseConfig(): { configured: boolean; config: FirebaseWebConfig } {
  const config: FirebaseWebConfig = {
    apiKey: escolher(import.meta.env.VITE_FIREBASE_API_KEY, firebaseConfigFallback.apiKey),
    authDomain: escolher(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, firebaseConfigFallback.authDomain),
    projectId: escolher(import.meta.env.VITE_FIREBASE_PROJECT_ID, firebaseConfigFallback.projectId),
    storageBucket: escolher(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, firebaseConfigFallback.storageBucket),
    messagingSenderId: escolher(
      import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      firebaseConfigFallback.messagingSenderId,
    ),
    appId: escolher(import.meta.env.VITE_FIREBASE_APP_ID, firebaseConfigFallback.appId),
  }
  const measurementId = escolher(
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    firebaseConfigFallback.measurementId,
  )
  if (measurementId) config.measurementId = measurementId
  return { configured: isFirebaseConfigured(config), config }
}

/** IA ligada por padrão. Defina VITE_AI_ENABLED=false para desligar. */
export function aiHabilitado(): boolean {
  const flag = limpar(import.meta.env.VITE_AI_ENABLED).toLowerCase()
  if (flag === 'false' || flag === '0' || flag === 'off' || flag === 'nao' || flag === 'não') return false
  return true
}

/** Storage fica desligado no Spark. Só liga com VITE_STORAGE_ENABLED=true. */
export function storageHabilitado(): boolean {
  return limpar(import.meta.env.VITE_STORAGE_ENABLED).toLowerCase() === 'true'
}

export function modeloAi(): string {
  return limpar(import.meta.env.VITE_AI_MODEL) || 'gemini-3.8-flash'
}
