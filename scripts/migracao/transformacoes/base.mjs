// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { createHash } from 'node:crypto'
import { decodificar } from '../formatoExportacao.mjs'

export const campoFirestore = coluna => coluna === 'gerado_por_ia' ? 'geradoPorIA' : coluna.replace(/_([a-z])/g, (_, letra) => letra.toUpperCase())
export const idPai = doc => doc.path.split('/').at(-3)

// Namespace URL do RFC 9562. O nome inclui a origem e o caminho completo.
export function uuidDocumento(path) {
  const hash = createHash('sha1')
    .update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'))
    .update('urn:ubox:firestore:' + path).digest()
  hash[6] = (hash[6] & 15) | 80
  hash[8] = (hash[8] & 63) | 128
  const hex = hash.toString('hex', 0, 16)
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

class Timestamp {
  constructor(s, ns) {
    this.s = s
    this.ns = ns
  }
}

function dataPostgres(valor) {
  if (valor instanceof Timestamp || (valor && Number.isInteger(valor._seconds))) {
    const { s = valor._seconds, ns = valor._nanoseconds } = valor
    if (!Number.isInteger(s) || !Number.isInteger(ns) || ns < 0 || ns >= 1e9) throw new TypeError()
    const segundo = new Date(s * 1000).toISOString().slice(0, -5)
    // Postgres armazena microssegundos. Trunca os três dígitos submicrossegundo.
    return segundo + '.' + String(Math.floor(ns / 1000)).padStart(6, '0') + 'Z'
  }
  if (typeof valor === 'string' && /^\d{4}-\d\d-\d\dT/.test(valor) && Number.isFinite(Date.parse(valor))) {
    return valor
  }
  throw new TypeError()
}

class Referencia {
  constructor(path) { this.path = path }
}
class GeoPoint {
  constructor(latitude, longitude) { Object.assign(this, { latitude, longitude }) }
}
const tipos = { Timestamp, referencia: path => new Referencia(path), GeoPoint, vetor: valores => valores }
export const dadosDocumento = doc => decodificar(doc.data, tipos)

function valorEscalar(valor) {
  if (valor instanceof Referencia) return valor.path.split('/').at(-1)
  if (typeof valor === 'bigint') return valor.toString()
  if (valor !== null && typeof valor === 'object' && !Array.isArray(valor)) throw new TypeError()
  if (typeof valor === 'number' && !Number.isFinite(valor)) throw new TypeError()
  return valor
}

function trocarPrefixoUid(id, uidFirebase, uidSupabase) {
  const prefixo = uidFirebase + '_'
  return uidSupabase && typeof id === 'string' && id.startsWith(prefixo)
    ? uidSupabase + id.slice(uidFirebase.length)
    : id
}

// Lista de colunas aceitas. d = data, u = UID, U = lista de UIDs, j = JSON. O sufixo ! exige
// presença e ? permite nulo. O chamador serializa JSON ao vincular os parâmetros SQL.
export function tabela(nome, lista, op = {}) {
  const campos = lista.trim().split(/\s+/).map(item => {
    const [coluna, tipo = ''] = item.replace(/[!?]/g, '').split(':')
    return { coluna, origem: campoFirestore(coluna), tipo, exigido: item.endsWith('!'), nulo: item.endsWith('?') }
  })
  const [colunaPai, tabelaPai, chavePai = 'id'] = op.pai?.split(':') ?? []
  const pk = (op.pk ?? op.id ?? 'id').split(', ')
  const json = campos.filter(c => c.tipo === 'j' || c.coluna === 'visivel_para').map(c => c.coluna)
  if (op.gabarito) json.push('dados')
  const enums = Object.fromEntries(Object.entries(op.enums ?? {}).map(([coluna, valores]) => [
    coluna, new Set(typeof valores === 'string' ? valores.split(' ') : valores),
  ]))
  const conhecidos = new Set(campos.map(c => c.origem))
  if (op.identidade) conhecidos.add(op.identidade)

  return {
    nome, pk, json,
    transformar(doc, ctx) {
      const dados = dadosDocumento(doc)
      const linha = {}
      const pendencias = []
      let rejeitado = false
      const registrar = (campo, motivo, impede = true) => {
        pendencias.push({ tabela: nome, campo, motivo })
        rejeitado ||= impede
      }
      const uid = (valor, campo, impede) => {
        const mapeado = ctx.uid(valorEscalar(valor))
        if (!mapeado) registrar(campo, 'UID sem correspondência', impede)
        return mapeado ?? null
      }

      for (const { coluna, origem, tipo, exigido, nulo } of campos) {
        const valor = dados[origem]
        if (valor === undefined) {
          if (exigido) registrar(origem, tipo === 'u' ? 'UID ausente' : 'campo obrigatório ausente')
          continue
        }
        if (valor === null) {
          if (!nulo) registrar(origem, tipo === 'u' ? 'UID ausente' : 'campo obrigatório nulo')
          else linha[coluna] = null
          continue
        }
        if (enums[coluna] && !enums[coluna].has(valor)) {
          registrar(origem, 'enum inválido')
          continue
        }
        try {
          if (tipo === 'u') linha[coluna] = uid(valor, origem, !nulo)
          else if (tipo === 'U') linha[coluna] = valor.map(item => uid(item, origem, !nulo)).filter(Boolean)
          else if (tipo === 'd') linha[coluna] = dataPostgres(valor)
          // Os mapas JSON preservam a representação exportada, inclusive os tipos aninhados.
          else if (tipo === 'j') linha[coluna] = doc.data.__tipo === 'mapa' ? doc.data.campos[origem] : doc.data[origem]
          else linha[coluna] = valorEscalar(valor)
        } catch {
          registrar(origem, 'formato inválido')
        }
      }

      if (op.identidade && Object.hasOwn(dados, op.identidade) && dados[op.identidade] !== doc.id) {
        registrar(op.identidade, 'identidade diferente do caminho')
      }
      if (op.idFilho && doc.id !== op.idFilho) registrar('id', 'documento filho não canônico')
      if (op.chaveFilha) linha[op.chaveFilha] = doc.id
      else if (pk.includes('id')) linha.id = op.idUuid ? uuidDocumento(doc.path) : doc.id
      else if (op.id) linha[op.id] = doc.id
      if (colunaPai) linha[colunaPai] = idPai(doc)
      // IDs compostos no app: leituras, aceites, certificados, avisos_leituras,
      // progresso_manuais, tentativas_prova e reestudos.
      const remapearId = id => trocarPrefixoUid(id, dados.uid, linha.uid)
      if (op.idComUid) linha.id = remapearId(linha.id)
      if (op.paiComUid) linha[colunaPai] = remapearId(linha[colunaPai])
      if (op.filha && ctx.temDocumento?.(doc.path + '/' + op.filha)) linha.folha_id = linha.id
      if (op.referenciaTentativa) {
        const tentativa = linha.tentativa_id
        // O certificado também aceita tentativas de quiz com ID opaco e o marcador sem-quiz.
        if (ctx.temDocumento?.('tentativasProva/' + tentativa) || !ctx.temDocumento?.('tentativas/' + tentativa)) {
          linha.tentativa_id = remapearId(tentativa)
        }
      }
      if (op.responsavelOpcional && linha.responsavel_id == null) {
        if (linha.responsavel_nome != null) registrar('responsavelNome', 'nome omitido sem responsável válido', false)
        linha.responsavel_nome = null
      }

      const extras = Object.keys(dados).filter(chave => !conhecidos.has(chave)).sort()
      if (op.gabarito) {
        const bruto = doc.data.__tipo === 'mapa' ? doc.data.campos : doc.data
        linha.dados = Object.fromEntries(extras.map(chave => [chave, bruto[chave]]))
      }

      if (!rejeitado) op.validar?.(linha, registrar)
      const depende = colunaPai ? { tabela: tabelaPai, coluna: chavePai, valor: linha[colunaPai] } : null
      const linhas = rejeitado ? [] : [{ tabela: nome, linha, pk, json, depende }]
      return { linhas, pendencias, desconhecidos: op.gabarito ? [] : extras }
    },
  }
}
