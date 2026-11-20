// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { describe, it, expect } from 'vitest'
import { converterData, planejarImportacao } from './mapearUsuarios.mjs'

const conta = (uid, email = `${uid}@ubox.test`) => ({ uid, email })
const perfil = (id, data = {}) => ({
  id,
  data: { nome: 'Pessoa Teste', email: `${id}@ubox.test`, papel: 'franqueado', ...data },
})
const unidade = (data = {}) => ({
  id: 'loja',
  data: { nome: 'Loja Teste', responsavel: 'Pessoa Teste', email: 'loja@ubox.test', ...data },
})
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function planejar(dados) {
  let n = 0
  return planejarImportacao({ auth: [], usuarios: [], unidades: [], config: {}, ...dados }, {
    gerarId: () => uuid(++n),
  })
}

describe('converterData', () => {
  it('normaliza os dois formatos do Firestore e strings ISO', () => {
    const iso = '1970-01-01T00:00:01.250Z'
    expect(converterData({ _seconds: 1, _nanoseconds: 250_000_000 })).toBe(iso)
    expect(converterData({ seconds: 1, nanoseconds: 250_000_000 })).toBe(iso)
    expect(converterData('1969-12-31T21:00:01.250-03:00')).toBe(iso)
  })

  it('retorna nulo para datas ausentes ou inválidas', () => {
    for (const valor of [undefined, null, 'inválida', {}, { seconds: Infinity }]) {
      expect(converterData(valor)).toBeNull()
    }
  })
})

describe('planejarImportacao', () => {
  it('usa o ID do documento e mantém a mesma associação em todas as linhas', () => {
    const plano = planejar({
      auth: [conta('dono'), conta('equipe')],
      usuarios: [
        perfil('dono', { uid: 'outro', unidadeId: 'loja' }),
        perfil('equipe', { papel: 'equipe_franqueado', criadoPor: 'dono' }),
      ],
      unidades: [unidade({ uid: 'dono', criadoPor: 'equipe' })],
    })
    expect(plano.mapaUids).toEqual({ dono: uuid(1), equipe: uuid(2) })
    expect(plano.usuarios[0]).toMatchObject({ id: uuid(1), firebase_uid: 'dono', unidade_id: 'loja' })
    expect(plano.usuarios[1].criado_por).toBe(uuid(1))
    expect(plano.unidades[0]).toMatchObject({ uid: uuid(1), criado_por: uuid(2) })
  })

  it('ignora o perfil sem conta e preserva a conta sem perfil', () => {
    const plano = planejar({ auth: [conta('so-auth')], usuarios: [perfil('so-perfil')] })
    expect(plano.authUsers).toEqual([{ id: uuid(1), email: 'so-auth@ubox.test' }])
    expect(plano.usuarios).toEqual([])
    expect(plano.contagens).toMatchObject({ contasSemPerfil: 1, perfisIgnorados: 1 })
    expect(plano.avisos).toHaveLength(1)
  })

  it('ignora perfis com papel inválido ou nome curto após aparar espaços', () => {
    const plano = planejar({
      auth: [conta('papel'), conta('nome')],
      usuarios: [perfil('papel', { papel: 'outro' }), perfil('nome', { nome: ' X ' })],
    })
    expect(plano.authUsers).toHaveLength(2)
    expect(plano.usuarios).toEqual([])
    expect(plano.avisos).toHaveLength(2)
  })

  it('apara o nome e limita textos ao tamanho das colunas', () => {
    const longo = 'á'.repeat(220)
    const email = `${'A'.repeat(210)}@ubox.test`
    const plano = planejar({
      auth: [conta('pessoa', email)],
      usuarios: [perfil('pessoa', { email, nome: `  ${longo}  `, unidade: longo, cidade: longo })],
      unidades: [unidade({ nome: longo, cidade: longo, responsavel: longo, email })],
    })
    expect(plano.usuarios[0]).toMatchObject({
      nome: longo.slice(0, 120), cidade: longo.slice(0, 120),
      unidade: longo.slice(0, 120), email: email.toLowerCase().slice(0, 199),
    })
    expect(plano.unidades[0]).toMatchObject({
      nome: longo.slice(0, 120), cidade: longo.slice(0, 120),
      responsavel: longo.slice(0, 120), email: email.toLowerCase().slice(0, 199),
    })
  })

  it('anula referências ausentes ou sem perfil importado quando a FK exige perfil', () => {
    const plano = planejar({
      auth: [conta('pessoa'), conta('so-auth')],
      usuarios: [perfil('pessoa', { criadoPor: 'desconhecido', unidadeId: 'inexistente' })],
      unidades: [unidade({ uid: 'so-auth', criadoPor: 'desconhecido' }),
        { ...unidade({ uid: 'desconhecido' }), id: 'outra' }],
    })
    expect(plano.usuarios[0]).toMatchObject({ criado_por: null, unidade_id: null })
    expect(plano.unidades[0]).toMatchObject({ uid: null, criado_por: null })
    expect(plano.unidades[1].uid).toBeNull()
    expect(plano.avisos).toHaveLength(3)
  })

  it('usa lista vazia para módulos ausentes e mantém até 40 strings', () => {
    const modulos = Array.from({ length: 41 }, (_, i) => `modulo-${i}`)
    const plano = planejar({
      auth: [conta('pessoa'), conta('equipe')],
      usuarios: [perfil('pessoa'), perfil('equipe', { modulosLiberados: [null, ...modulos] })],
      unidades: [unidade({ modulosLiberados: [42, ...modulos] })],
    })
    expect(plano.usuarios[0].modulos_liberados).toEqual([])
    expect(plano.usuarios[1].modulos_liberados).toEqual(modulos.slice(0, 40))
    expect(plano.unidades[0].modulos_liberados).toEqual(modulos.slice(0, 40))
  })

  it('normaliza e-mails e mantém a primeira conta em caso de duplicidade', () => {
    const plano = planejar({
      auth: [conta('primeira', 'PESSOA@UBOX.TEST'), conta('segunda', 'pessoa@ubox.test')],
      usuarios: [perfil('segunda')],
    })
    expect(plano.authUsers).toEqual([{ id: uuid(1), email: 'pessoa@ubox.test' }])
    expect(plano.mapaUids).toEqual({ primeira: uuid(1) })
    expect(plano.usuarios).toEqual([])
    expect(plano.contagens.contasDuplicadas).toBe(1)
    expect(plano.avisos).toHaveLength(2)
  })

  it('importa a trava somente para um perfil de admin importado', () => {
    const dados = {
      auth: [conta('admin'), conta('pessoa'), conta('sem-perfil')],
      usuarios: [perfil('admin', { papel: 'admin' }), perfil('pessoa')],
    }
    const criadoEm = '2025-01-01T00:00:00.000Z'
    expect(planejar({ ...dados, config: { adminCriado: { uid: 'admin', email: 'ADMIN@UBOX.TEST', criadoEm } } }).adminLock)
      .toEqual({ id: 'adminCriado', uid: uuid(1), email: 'admin@ubox.test', criado_em: criadoEm })
    for (const uid of ['pessoa', 'sem-perfil', 'desconhecido']) {
      const plano = planejar({ ...dados, config: { adminCriado: { uid } } })
      expect(plano.adminLock).toBeNull()
      expect(plano.avisos).toHaveLength(1)
    }
    expect(planejar(dados)).toMatchObject({ adminLock: null, avisos: [] })
  })

  it('projeta somente os campos previstos e mantém os dados do perfil', () => {
    const auth = conta('pessoa')
    Object.defineProperty(auth, 'passwordHash', {
      get() { throw new Error('Acessou campo de senha') },
    })
    const plano = planejar({
      auth: [auth],
      usuarios: [perfil('pessoa', { ativo: true, recusado: true, criadoEm: { seconds: 0 } })],
    })
    expect(plano.authUsers).toEqual([{ id: uuid(1), email: 'pessoa@ubox.test' }])
    expect(plano.usuarios[0]).toEqual({
      id: uuid(1), firebase_uid: 'pessoa', email: 'pessoa@ubox.test', nome: 'Pessoa Teste',
      papel: 'franqueado', ativo: true, recusado: true, unidade: '', cidade: '',
      unidade_id: null, modulos_liberados: [], criado_por: null,
      criado_em: '1970-01-01T00:00:00.000Z', atualizado_em: null,
    })
  })
})
