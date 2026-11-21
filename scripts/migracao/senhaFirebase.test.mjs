import { expect, it } from 'vitest'
import { hashRedigido, lerHashConfig, montarPasswordHash, resumoHashes } from './senhaFirebase.mjs'

it('recusa hash redigido e monta o formato fbscrypt com parâmetros completos', () => {
  expect(hashRedigido('UkVEQUNURUQ=')).toBe(true)
  expect(hashRedigido('')).toBe(true)
  expect(hashRedigido(null)).toBe(true)
  expect(hashRedigido('dGVzdGhhc2g=')).toBe(false)
  const packed = montarPasswordHash({
    memoryCost: 14,
    rounds: 8,
    saltSeparator: 'Bw==',
    signerKey: 'c2lnbmVy',
    salt: 'c2FsdA==',
    passwordHash: 'dGVzdGhhc2g=',
  })
  expect(packed).toBe('$fbscrypt$v=1,n=14,r=8,p=1,ss=Bw==,sk=c2lnbmVy$c2FsdA==$dGVzdGhhc2g=')
  expect(montarPasswordHash({
    memoryCost: 14, rounds: 8, saltSeparator: 'Bw==', signerKey: 'c2lnbmVy',
    salt: 'c2FsdA==', passwordHash: 'UkVEQUNURUQ=',
  })).toBeNull()
})

it('só considera o hashConfig preenchido quando chave e custos existem', () => {
  expect(lerHashConfig({ signIn: { hashConfig: {} } }).completo).toBe(false)
  const params = lerHashConfig({
    signIn: { hashConfig: { algorithm: 'SCRYPT', signerKey: 'abc', saltSeparator: 'Bw==', rounds: 8, memoryCost: 14 } },
  })
  expect(params).toMatchObject({ completo: true, rounds: 8, memoryCost: 14, signerKey: 'abc', saltSeparator: 'Bw==' })
  const resumo = resumoHashes([
    { uid: 'a', passwordHash: 'dGVzdGhhc2g=', salt: 'c2FsdA==' },
    { uid: 'b', passwordHash: 'UkVEQUNURUQ=', salt: '' },
  ], params)
  expect(resumo).toMatchObject({ total: 2, comHash: 1, semHash: 1, paramsCompletos: true, uidsSemHash: ['b'] })
})
