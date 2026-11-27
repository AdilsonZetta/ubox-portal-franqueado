import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ERRO_LOGIN, lerCredenciais } from './regras.ts'

test('rejeita CPF e formatos inválidos sem ecoar os dados', () => {
  assert.equal(lerCredenciais({ cpf: '11111111111', senha: 'exemplo' }), null)
  assert.equal(lerCredenciais({ cpf: '52998224725', senha: 42 }), null)
  assert.equal(lerCredenciais({ cpf: '52998224725', senha: '', unidade_id: 'u' }), null)
  assert.equal(ERRO_LOGIN, 'CPF ou senha inválidos.')
})

test('normaliza o CPF e preserva os espaços da senha', () => {
  assert.deepEqual(lerCredenciais({ cpf: '529.982.247-25', senha: ' exemplo ', unidade_id: 'u' }),
    { cpf: '52998224725', senha: ' exemplo ', unidadeId: 'u' })
})
