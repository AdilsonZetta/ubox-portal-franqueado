/**
 * Qual backend o app usa. Produção atual: VITE_BACKEND=supabase; firebase permanece para rollback.
 * Ver MIGRACAO_SUPABASE.md.
 */
export type Backend = 'firebase' | 'supabase'

export function escolherBackend(valor: string | undefined): Backend {
  return valor?.trim().toLowerCase() === 'supabase' ? 'supabase' : 'firebase'
}

export const BACKEND: Backend = escolherBackend(import.meta.env.VITE_BACKEND)

/** Auth, Firestore e App Check do app padrão só inicializam neste modo. Em supabase o login não passa pelo Firebase; a IA pode pedir um app mínimo depois, fora de /entrar. */
export function deveInicializarFirebase(backend: Backend = BACKEND): boolean {
  return backend === 'firebase'
}
