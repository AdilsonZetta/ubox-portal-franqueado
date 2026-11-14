import { readFileSync, existsSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, inMemoryPersistence, setPersistence, signInWithEmailAndPassword } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

function carregarEnv() {
  for (const arquivo of ['.env.local', '.env']) {
    if (!existsSync(arquivo)) continue
    for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
      const match = linha.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!match || process.env[match[1]]) continue
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  }
}

function campo(fonte, nome) {
  const match = fonte.match(new RegExp(`${nome}:\\s*'([^']*)'`))
  return match?.[1] ?? ''
}

export function configFirebase() {
  carregarEnv()
  const fonte = readFileSync(new URL('../src/firebaseConfig.ts', import.meta.url), 'utf8')
  const escolher = (env, chave) => (process.env[env] || '').trim() || campo(fonte, chave)
  return {
    apiKey: escolher('VITE_FIREBASE_API_KEY', 'apiKey'),
    authDomain: escolher('VITE_FIREBASE_AUTH_DOMAIN', 'authDomain'),
    projectId: escolher('VITE_FIREBASE_PROJECT_ID', 'projectId'),
    storageBucket: escolher('VITE_FIREBASE_STORAGE_BUCKET', 'storageBucket'),
    messagingSenderId: escolher('VITE_FIREBASE_MESSAGING_SENDER_ID', 'messagingSenderId'),
    appId: escolher('VITE_FIREBASE_APP_ID', 'appId'),
  }
}

export async function entrarComoAdmin() {
  const email = process.env.ADMIN_EMAIL
  const senha = process.env.ADMIN_PASSWORD
  if (!email || !senha) {
    throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD no ambiente ou no .env.local.')
  }
  const app = initializeApp(configFirebase())
  const auth = getAuth(app)
  const db = getFirestore(app)
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const host = process.env.FIREBASE_AUTH_EMULATOR_HOST
    connectAuthEmulator(auth, host.startsWith('http') ? host : `http://${host}`, { disableWarnings: true })
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const [nome, porta] = process.env.FIRESTORE_EMULATOR_HOST.split(':')
    connectFirestoreEmulator(db, nome, Number(porta || 8080))
  }
  await setPersistence(auth, inMemoryPersistence)
  const credencial = await signInWithEmailAndPassword(auth, email, senha)
  return { auth, db, usuario: credencial.user }
}
