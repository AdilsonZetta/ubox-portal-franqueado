/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string
  readonly VITE_FIREBASE_PROJECT_ID?: string
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string
  readonly VITE_FIREBASE_APP_ID?: string
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string
  readonly VITE_AI_ENABLED?: string
  readonly VITE_AI_MODEL?: string
  readonly VITE_STORAGE_ENABLED?: string
  readonly VITE_APPCHECK_SITE_KEY?: string
  readonly VITE_USE_EMULATOR?: string
  /** 'firebase' (padrão) ou 'supabase'. Migração em andamento: ver MIGRACAO_SUPABASE.md. */
  readonly VITE_BACKEND?: string
  readonly VITE_SUPABASE_URL?: string
  /** Só a chave publicável (sb_publishable_…). Nunca a service_role. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
