import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, type DocumentData } from 'firebase/firestore'
import { requireDb } from './firebase'
import { paraMillis } from './format'
import {
  centavos,
  gerarToken,
  primeiroNomeDe,
  tokenValido,
  type Cliente,
  type ClienteForm,
  type Cobranca,
  type ItensPainel,
  type Painel,
  type Recado,
  type StatusVisita,
  type Visita,
} from './cliente'
import { ordenarCobrancas, ordenarRecados, ordenarVisitas } from './cliente'
import type { Usuario } from '../types'

const texto = (v: unknown, padrao = '') => (typeof v === 'string' ? v : padrao)
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function mapCliente(id: string, d: DocumentData): Cliente {
  return {
    id,
    unidadeId: texto(d.unidadeId),
    nome: texto(d.nome),
    telefone: texto(d.telefone),
    email: texto(d.email),
    box: texto(d.box),
    contratoInicioMs: paraMillis(d.contratoInicio),
    contratoFimMs: paraMillis(d.contratoFim),
    valorMensalCentavos: numero(d.valorMensalCentavos),
    diaVencimento: numero(d.diaVencimento) || 10,
    status: d.status === 'encerrado' ? 'encerrado' : 'ativo',
    painelToken: texto(d.painelToken),
    obs: texto(d.obs),
    criadoEmMs: paraMillis(d.criadoEm),
    atualizadoPorNome: texto(d.atualizadoPorNome),
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

export function mapPainel(token: string, d: DocumentData): Painel {
  return {
    token,
    unidadeId: texto(d.unidadeId),
    unidadeNome: texto(d.unidadeNome),
    contatoUnidade: texto(d.contatoUnidade),
    clienteId: texto(d.clienteId),
    primeiroNome: texto(d.primeiroNome),
    box: texto(d.box),
    contratoInicioMs: paraMillis(d.contratoInicio),
    contratoFimMs: paraMillis(d.contratoFim),
    valorMensalCentavos: numero(d.valorMensalCentavos),
    diaVencimento: numero(d.diaVencimento),
    ativo: d.ativo === true,
    atualizadoEmMs: paraMillis(d.atualizadoEm),
  }
}

const mapCobranca = (id: string, c: DocumentData): Cobranca => ({
  id, competencia: texto(c.competencia, id), valorCentavos: numero(c.valorCentavos), vencimento: texto(c.vencimento),
  status: c.status === 'pago' ? 'pago' : 'pendente', pagoEm: texto(c.pagoEm),
})
const mapVisita = (id: string, v: DocumentData): Visita => ({
  id, data: texto(v.data), hora: texto(v.hora), motivo: texto(v.motivo),
  status: v.status === 'realizada' || v.status === 'cancelada' ? v.status : 'agendada',
})
const mapRecado = (id: string, r: DocumentData): Recado => ({
  id, texto: texto(r.texto), criadoEmMs: paraMillis(r.criadoEm), autor: texto(r.autor), geradoPorIA: r.geradoPorIA === true, iaModelo: texto(r.iaModelo),
})

/** Itens do painel (subcoleções). As rules liberam para o público só enquanto o painel está ativo. */
export async function carregarItens(token: string): Promise<ItensPainel> {
  const banco = requireDb()
  const [c, v, r] = await Promise.all(['cobrancas', 'visitas', 'recados'].map((sub) => getDocs(collection(banco, 'clientePaineis', token, sub))))
  return {
    cobrancas: ordenarCobrancas(c.docs.map((d) => mapCobranca(d.id, d.data()))),
    visitas: ordenarVisitas(v.docs.map((d) => mapVisita(d.id, d.data()))),
    recados: ordenarRecados(r.docs.map((d) => mapRecado(d.id, d.data()))),
  }
}

/** Cobranças de cada cliente ativo (para os números da unidade). */
export async function carregarCobrancasDaUnidade(paineis: Map<string, Painel>): Promise<Map<string, Cobranca[]>> {
  const banco = requireDb()
  const pares = await Promise.all([...paineis.values()].map(async (p) => {
    const snap = await getDocs(collection(banco, 'clientePaineis', p.token, 'cobrancas'))
    return [p.clienteId, snap.docs.map((d) => mapCobranca(d.id, d.data()))] as const
  }))
  return new Map(pares)
}

export async function lancarCobranca(painel: Painel, c: Omit<Cobranca, 'id'>): Promise<void> {
  const ref = doc(requireDb(), 'clientePaineis', painel.token, 'cobrancas', c.competencia)
  if ((await getDoc(ref)).exists()) throw new Error('Já existe cobrança para esse mês.')
  await setDoc(ref, { competencia: c.competencia, valorCentavos: c.valorCentavos, vencimento: c.vencimento, status: c.status, pagoEm: c.pagoEm })
}

export async function marcarCobranca(painel: Painel, competencia: string, pago: boolean, dia: string): Promise<void> {
  await updateDoc(doc(requireDb(), 'clientePaineis', painel.token, 'cobrancas', competencia), { status: pago ? 'pago' : 'pendente', pagoEm: pago ? dia : '' })
}

export async function agendarVisita(painel: Painel, v: Omit<Visita, 'id' | 'status'>): Promise<void> {
  await setDoc(doc(collection(requireDb(), 'clientePaineis', painel.token, 'visitas')), { data: v.data, hora: v.hora, motivo: v.motivo.trim().slice(0, 200), status: 'agendada' })
}

export async function mudarVisita(painel: Painel, id: string, status: Exclude<StatusVisita, 'agendada'>): Promise<void> {
  await updateDoc(doc(requireDb(), 'clientePaineis', painel.token, 'visitas', id), { status })
}

export async function publicarRecado(painel: Painel, r: { texto: string; autor: string; geradoPorIA: boolean; iaModelo: string }): Promise<void> {
  await setDoc(doc(collection(requireDb(), 'clientePaineis', painel.token, 'recados')), {
    texto: r.texto.trim().slice(0, 500), criadoEm: serverTimestamp(), autor: r.autor.slice(0, 40), geradoPorIA: r.geradoPorIA, iaModelo: r.geradoPorIA ? r.iaModelo.trim().slice(0, 80) : '',
  })
}

/** Unidade: clientes (PII) e painéis da própria unidade, sempre com o filtro que as rules exigem. */
export async function carregarClientes(unidadeId: string): Promise<{ clientes: Cliente[]; paineis: Map<string, Painel> }> {
  const banco = requireDb()
  const [c, p] = await Promise.all([
    getDocs(query(collection(banco, 'clientes'), where('unidadeId', '==', unidadeId))),
    getDocs(query(collection(banco, 'clientePaineis'), where('unidadeId', '==', unidadeId))),
  ])
  const clientes = c.docs.map((d) => mapCliente(d.id, d.data())).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const atuais = new Set(clientes.map((x) => x.painelToken))
  // Só o painel atual de cada cliente (links trocados ficam desativados no histórico).
  const paineis = new Map(p.docs.filter((d) => atuais.has(d.id)).map((d) => { const m = mapPainel(d.id, d.data()); return [m.clienteId, m] as const }))
  return { clientes, paineis }
}

/** Link público: lê só o painel do token (sem login). Desativado/inexistente → null. */
export async function lerPainelPublico(token: string): Promise<Painel | null> {
  if (!tokenValido(token)) return null
  try {
    const snap = await getDoc(doc(requireDb(), 'clientePaineis', token))
    return snap.exists() ? mapPainel(token, snap.data()) : null
  } catch {
    return null
  }
}

const dataMeioDia = (dia: string) => new Date(`${dia}T12:00:00`)
const contrato = (f: ClienteForm) => ({
  box: f.box.trim().slice(0, 60),
  contratoInicio: dataMeioDia(f.contratoInicio),
  contratoFim: f.contratoFim ? dataMeioDia(f.contratoFim) : null,
  valorMensalCentavos: centavos(f.valorMensal),
  diaVencimento: Number(f.diaVencimento),
})
const autoria = (autor: Usuario) => ({ atualizadoPor: autor.uid, atualizadoPorNome: autor.nome, atualizadoEm: serverTimestamp() })
const pessoais = (f: ClienteForm) => ({ nome: f.nome.trim().slice(0, 120), telefone: f.telefone.trim().slice(0, 30), email: f.email.trim().slice(0, 120), obs: f.obs.trim().slice(0, 1000) })

/** Cliente (PII) e painel (sem PII, link desativado) nascem juntos, no mesmo lote. */
export async function criarCliente(autor: Usuario, f: ClienteForm, contatoUnidade: string): Promise<string> {
  const banco = requireDb()
  const ref = doc(collection(banco, 'clientes'))
  const token = gerarToken()
  const lote = writeBatch(banco)
  lote.set(ref, { unidadeId: autor.unidadeId ?? '', ...pessoais(f), ...contrato(f), status: 'ativo', painelToken: token, criadoEm: serverTimestamp(), ...autoria(autor) })
  lote.set(doc(banco, 'clientePaineis', token), {
    unidadeId: autor.unidadeId ?? '', unidadeNome: autor.unidade ?? '', contatoUnidade: contatoUnidade.trim().slice(0, 120), clienteId: ref.id,
    primeiroNome: primeiroNomeDe(f.nome), ...contrato(f), ativo: false, atualizadoEm: serverTimestamp(),
  })
  await lote.commit()
  return ref.id
}

/** Edita o cadastro e espelha no painel só o que o cliente pode ver (primeiro nome e contrato). */
export async function salvarCliente(autor: Usuario, cliente: Cliente, f: ClienteForm, status: Cliente['status']): Promise<void> {
  const banco = requireDb()
  const lote = writeBatch(banco)
  lote.update(doc(banco, 'clientes', cliente.id), { ...pessoais(f), ...contrato(f), status, ...autoria(autor) })
  lote.update(doc(banco, 'clientePaineis', cliente.painelToken), { primeiroNome: primeiroNomeDe(f.nome), ...contrato(f), ...(status === 'encerrado' ? { ativo: false } : {}), atualizadoEm: serverTimestamp() })
  await lote.commit()
}

export type MudancaPainel = Partial<Pick<Painel, 'ativo' | 'contatoUnidade'>>

export async function atualizarPainel(painel: Painel, m: MudancaPainel): Promise<void> {
  await updateDoc(doc(requireDb(), 'clientePaineis', painel.token), { ...m, atualizadoEm: serverTimestamp() })
}

/** Troca o link (ex.: o antigo vazou): painel novo com cópia dos itens, cliente aponta para ele e o antigo é desativado, num lote só. */
export async function trocarLink(autor: Usuario, cliente: Cliente, painel: Painel, itens: ItensPainel): Promise<string> {
  const banco = requireDb()
  const token = gerarToken()
  const lote = writeBatch(banco)
  lote.set(doc(banco, 'clientePaineis', token), {
    unidadeId: painel.unidadeId, unidadeNome: autor.unidade ?? painel.unidadeNome, contatoUnidade: painel.contatoUnidade, clienteId: cliente.id,
    primeiroNome: painel.primeiroNome, box: painel.box, contratoInicio: new Date(painel.contratoInicioMs),
    contratoFim: painel.contratoFimMs ? new Date(painel.contratoFimMs) : null, valorMensalCentavos: painel.valorMensalCentavos, diaVencimento: painel.diaVencimento,
    ativo: painel.ativo, atualizadoEm: serverTimestamp(),
  })
  for (const c of itens.cobrancas) lote.set(doc(banco, 'clientePaineis', token, 'cobrancas', c.competencia), { competencia: c.competencia, valorCentavos: c.valorCentavos, vencimento: c.vencimento, status: c.status, pagoEm: c.pagoEm })
  for (const v of itens.visitas) lote.set(doc(banco, 'clientePaineis', token, 'visitas', v.id), { data: v.data, hora: v.hora, motivo: v.motivo, status: v.status })
  for (const r of itens.recados) lote.set(doc(banco, 'clientePaineis', token, 'recados', r.id), { texto: r.texto, criadoEm: new Date(r.criadoEmMs), autor: r.autor, geradoPorIA: r.geradoPorIA, iaModelo: r.iaModelo })
  lote.update(doc(banco, 'clientes', cliente.id), { painelToken: token, ...autoria(autor) })
  lote.update(doc(banco, 'clientePaineis', painel.token), { ativo: false, atualizadoEm: serverTimestamp() })
  await lote.commit()
  return token
}
