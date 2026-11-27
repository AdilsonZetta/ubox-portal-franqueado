import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeGerarLink } from './regras.ts'

test('só equipe ativa da unidade com módulo cliente pode gerar o link', () => {
  const alvo = { id: 'c', unidade_id: 'u', papel: 'cliente' }
  const equipe = { id: 'e', unidade_id: 'u', papel: 'equipe_franqueado', ativo: true, recusado: false,
    unidade_ativa: true, modulos_liberados: ['cliente'] }
  assert.equal(podeGerarLink(equipe, alvo), true)
  assert.equal(podeGerarLink({ ...equipe, papel: 'franqueado' }, alvo), true)
  for (const mudanca of [{ unidade_id: 'v' }, { papel: 'admin' }, { papel: 'equipe_franqueadora' },
    { ativo: false }, { recusado: true }, { unidade_ativa: false }, { modulos_liberados: [] }]) {
    assert.equal(podeGerarLink({ ...equipe, ...mudanca }, alvo), false)
  }
})
