// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { expect, it } from 'vitest'
import { codificar, decodificar, resumirArquivo } from './formatoExportacao.mjs'

class Timestamp {
  constructor(seconds, nanoseconds) { Object.assign(this, { seconds, nanoseconds }) }
}

class GeoPoint {
  constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }) }
}

class DocumentReference {
  constructor(path) { this.path = path }
}

class VectorValue {
  constructor(valores) { this.valores = valores }
  toArray() { return this.valores }
}

it('preserva tipos especiais, números e mapas com a chave reservada', () => {
  const tipos = { Timestamp, GeoPoint, DocumentReference, VectorValue }
  const dados = {
    instante: new Timestamp(-1, 999999999),
    ref: new DocumentReference('unidades/centro'),
    ponto: new GeoPoint(-23.5, -46.6),
    bytes: Buffer.from([0, 255]),
    vetor: new VectorValue([1, -0, Infinity]),
    inteiros: [17n, 9223372036854775807n],
    lista: [null, true, 'texto', 17, NaN, Infinity, -Infinity, -0],
    mapa: { __tipo: 'timestamp', s: 0, ns: 0 },
  }
  const codificado = JSON.parse(JSON.stringify(codificar(dados, tipos)))
  expect(codificado.instante).toEqual({ __tipo: 'timestamp', s: -1, ns: 999999999 })
  expect(decodificar(codificado, {
    ...tipos,
    referencia: path => new DocumentReference(path),
    vetor: valores => new VectorValue(valores),
  })).toStrictEqual(dados)
})

it('resume os bytes exatos do arquivo em SHA-256', () => {
  expect(resumirArquivo('abc', 2)).toEqual({
    documentos: 2,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  })
})
