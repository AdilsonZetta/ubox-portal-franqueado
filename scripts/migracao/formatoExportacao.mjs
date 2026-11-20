// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { createHash } from 'node:crypto'

const numeros = new Map([['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['-0', -0]])

function instancia(valor, classe) {
  return classe && valor instanceof classe
}

export function codificar(valor, tipos = {}, { datasLegadas = false } = {}) {
  if (instancia(valor, tipos.Timestamp)) {
    const { seconds: s, nanoseconds: ns } = valor
    return datasLegadas ? { _seconds: s, _nanoseconds: ns } : { __tipo: 'timestamp', s, ns }
  }
  if (instancia(valor, tipos.DocumentReference)) return { __tipo: 'ref', path: valor.path }
  if (instancia(valor, tipos.GeoPoint)) {
    return { __tipo: 'geopoint', latitude: valor.latitude, longitude: valor.longitude }
  }
  if (valor instanceof Uint8Array) {
    return { __tipo: 'bytes', base64: Buffer.from(valor).toString('base64') }
  }
  if (instancia(valor, tipos.VectorValue)) {
    return { __tipo: 'vetor', valores: valor.toArray().map(item => codificar(item, tipos, { datasLegadas })) }
  }
  if (typeof valor === 'bigint') {
    const numero = Number(valor)
    return datasLegadas && Number.isSafeInteger(numero) ? numero : { __tipo: 'inteiro', valor: String(valor) }
  }
  if (typeof valor === 'number' && (!Number.isFinite(valor) || Object.is(valor, -0))) {
    return { __tipo: 'numero', valor: Object.is(valor, -0) ? '-0' : String(valor) }
  }
  const converter = item => codificar(item, tipos, { datasLegadas })
  if (Array.isArray(valor)) return valor.map(converter)
  if (valor !== null && typeof valor === 'object') {
    const campos = Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, converter(item)]))
    return Object.hasOwn(campos, '__tipo') ? { __tipo: 'mapa', campos } : campos
  }
  return valor
}

export function decodificar(valor, tipos = {}) {
  const converter = item => decodificar(item, tipos)
  const mapa = campos => Object.fromEntries(Object.entries(campos).map(([chave, item]) => [chave, converter(item)]))
  if (Array.isArray(valor)) return valor.map(converter)
  if (valor === null || typeof valor !== 'object') return valor
  if (!Object.hasOwn(valor, '__tipo')) return mapa(valor)
  switch (valor.__tipo) {
    case 'timestamp': return new tipos.Timestamp(valor.s, valor.ns)
    case 'ref': return tipos.referencia(valor.path)
    case 'geopoint': return new tipos.GeoPoint(valor.latitude, valor.longitude)
    case 'bytes': return Buffer.from(valor.base64, 'base64')
    case 'vetor': return tipos.vetor(valor.valores.map(converter))
    case 'inteiro': return BigInt(valor.valor)
    case 'numero': return numeros.get(valor.valor)
    case 'mapa': return mapa(valor.campos)
    default: throw new Error('Tipo desconhecido na exportação.')
  }
}

export function criarResumoArquivo() {
  const hash = createHash('sha256')
  return {
    adicionar: bytes => hash.update(bytes),
    finalizar: documentos => ({ documentos, sha256: hash.digest('hex') }),
  }
}

export function resumirArquivo(bytes, documentos) {
  const resumo = criarResumoArquivo()
  resumo.adicionar(bytes)
  return resumo.finalizar(documentos)
}
