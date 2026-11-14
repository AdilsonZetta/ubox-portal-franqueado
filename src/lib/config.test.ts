import { describe, expect, it } from 'vitest'
import { aiHabilitado, firebaseConfigFallback, isFirebaseConfigured, storageHabilitado } from '../firebaseConfig'

describe('firebaseConfig', () => {
  it('aceita o projeto ubox-portal-franqueado', () => {
    expect(isFirebaseConfigured(firebaseConfigFallback)).toBe(true)
    expect(firebaseConfigFallback.projectId).toBe('ubox-portal-franqueado')
  })

  it('recusa configuração vazia ou placeholder', () => {
    expect(isFirebaseConfigured({ ...firebaseConfigFallback, apiKey: '' })).toBe(false)
    expect(isFirebaseConfigured({ ...firebaseConfigFallback, apiKey: 'COLOQUE_SUA_API_KEY' })).toBe(false)
  })

  it('liga a IA por padrão e mantém o Storage desligado', () => {
    expect(aiHabilitado()).toBe(true)
    expect(storageHabilitado()).toBe(false)
  })
})
