import { describe, expect, it } from 'vitest'
import { deveInicializarFirebase, escolherBackend } from './backend'

describe('deveInicializarFirebase', () => {
  it('liga Firebase e App Check só no backend firebase, para rollback', () => {
    expect(deveInicializarFirebase('firebase')).toBe(true)
    expect(deveInicializarFirebase('supabase')).toBe(false)
  })

  it('segue o valor de VITE_BACKEND já normalizado', () => {
    expect(deveInicializarFirebase(escolherBackend('supabase'))).toBe(false)
    expect(deveInicializarFirebase(escolherBackend('firebase'))).toBe(true)
  })
})
