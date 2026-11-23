import { describe, expect, it } from 'vitest'
import { montarLinkSenha, podeGerarLink } from '../../supabase/functions/criar-conta/regras'
import { formatarValidadeLink } from './linkAcesso'

describe('autorização para gerar link de senha', () => {
  const admin = { id: 'admin', papel: 'admin', ativo: true, recusado: false }
  const franqueado = { ...admin, id: 'gestor', papel: 'franqueado', unidade_id: 'unidade-a' }
  const colaborador = { id: 'pessoa', papel: 'equipe_franqueado', unidade_id: 'unidade-a' }
  const equipeFranqueadora = { ...admin, id: 'equipe', papel: 'equipe_franqueadora' }

  it.each([
    ['admin para equipe da franqueadora', admin, equipeFranqueadora, true],
    ['admin para franqueado', admin, franqueado, true],
    ['admin para colaborador', admin, colaborador, true],
    ['admin para outro admin', admin, { ...admin, id: 'outro' }, false],
    ['admin para si', admin, admin, false],
    ['franqueado para a própria equipe', franqueado, colaborador, true],
    ['franqueado para outra unidade', franqueado, { ...colaborador, unidade_id: 'unidade-b' }, false],
    ['franqueado para outro gestor', franqueado, { ...franqueado, id: 'outro' }, false],
    ['franqueado para si', franqueado, franqueado, false],
    ['colaborador', { ...franqueado, papel: 'equipe_franqueado' }, colaborador, false],
    ['equipe da franqueadora', equipeFranqueadora, colaborador, false],
    ['chamador inativo', { ...admin, ativo: false }, colaborador, false],
    ['chamador recusado', { ...admin, recusado: true }, colaborador, false],
    ['franqueado sem unidade', { ...franqueado, unidade_id: null }, { ...colaborador, unidade_id: null }, false],
    ['mesmo id com papel divergente', admin, { ...colaborador, id: admin.id }, false],
  ] as const)('%s', (_caso, chamador, alvo, permitido) => {
    expect(podeGerarLink(chamador, alvo)).toBe(permitido)
  })
})

it.each([
  ['https://adilsonzetta.github.io', 'https://adilsonzetta.github.io'],
  ['http://localhost:5173', 'http://localhost:5173'],
  ['http://127.0.0.1:5173', 'http://127.0.0.1:5173'],
  ['https://adilsonzetta.github.io.exemplo.test', 'https://adilsonzetta.github.io'],
  [null, 'https://adilsonzetta.github.io'],
])('monta o link para a origem %s', (origem, esperada) => {
  expect(montarLinkSenha(origem, 'token+&')).toBe(
    `${esperada}/ubox-portal-franqueado/?token_hash=token%2B%26&type=recovery`,
  )
})

it('formata a validade em hora local com dois dígitos', () => {
  const local = new Date(2026, 0, 2, 9, 5)
  expect(formatarValidadeLink(local.toISOString())).toBe('Válido até 09:05 de 02/01')
})
