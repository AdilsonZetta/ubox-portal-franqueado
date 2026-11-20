// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import {
  centavos, gerarToken, ordenarCobrancas, ordenarRecados, ordenarVisitas, primeiroNomeDe, tokenValido,
  type Cliente, type ClienteForm, type Cobranca, type ItensPainel, type Painel, type StatusVisita, type Visita,
} from './cliente'
import { mapCliente, mapPainel, type MudancaPainel } from './clienteApi'
import { requireSupabase } from './supabase'
import type { Usuario } from '../types'

type Linha = Record<string, unknown>
type TabelaItem = 'cliente_painel_cobrancas' | 'cliente_painel_visitas' | 'cliente_painel_recados'
type Tabela = TabelaItem | 'clientes' | 'cliente_paineis'

const texto = (v: unknown) => typeof v === 'string' ? v : ''
const numero = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : 0
const dataSb = (v: unknown) => Date.parse(texto(v)) || 0

function contratoDaLinha(linha: Linha) {
  return {
    contratoInicio: dataSb(linha.contrato_inicio),
    contratoFim: dataSb(linha.contrato_fim),
    valorMensalCentavos: linha.valor_mensal_centavos,
    diaVencimento: linha.dia_vencimento,
  }
}

export function mapClienteSb(linha: Linha): Cliente {
  return mapCliente(texto(linha.id), {
    ...linha, ...contratoDaLinha(linha),
    unidadeId: linha.unidade_id, painelToken: linha.painel_token,
    criadoEm: dataSb(linha.criado_em), atualizadoEm: dataSb(linha.atualizado_em),
    atualizadoPorNome: linha.atualizado_por_nome,
  })
}

export function mapPainelSb(token: string, linha: Linha): Painel {
  return mapPainel(token, {
    ...linha, ...contratoDaLinha(linha),
    clienteId: linha.cliente_id, unidadeId: linha.unidade_id, unidadeNome: linha.unidade_nome,
    contatoUnidade: linha.contato_unidade, primeiroNome: linha.primeiro_nome,
    atualizadoEm: dataSb(linha.atualizado_em),
  })
}

const mapCobrancaSb = (c: Linha): Cobranca => ({
  id: texto(c.id ?? c.competencia), competencia: texto(c.competencia), valorCentavos: numero(c.valor_centavos),
  vencimento: texto(c.vencimento), status: c.status === 'pago' ? 'pago' : 'pendente', pagoEm: texto(c.pago_em),
})

function mapItens(cobrancas: Linha[], visitas: Linha[], recados: Linha[]): ItensPainel {
  return {
    cobrancas: ordenarCobrancas(cobrancas.map(mapCobrancaSb)),
    visitas: ordenarVisitas(visitas.map((v, i) => ({
      id: texto(v.id) || String(i), data: texto(v.data), hora: texto(v.hora), motivo: texto(v.motivo),
      status: v.status === 'realizada' || v.status === 'cancelada' ? v.status : 'agendada',
    }))),
    recados: ordenarRecados(recados.map((r, i) => ({
      id: texto(r.id) || String(i), texto: texto(r.texto), criadoEmMs: dataSb(r.criado_em),
      autor: texto(r.autor), geradoPorIA: r.gerado_por_ia === true, iaModelo: texto(r.ia_modelo),
    }))),
  }
}

async function listar(tabela: Tabela, campo: 'unidade_id' | 'painel_token', valor: string): Promise<Linha[]> {
  const linhas: Linha[] = []
  const pagina = 500
  const banco = requireSupabase()
  const chave = tabela === 'cliente_paineis' ? 'token' : 'id'
  for (;;) {
    const { data, error } = await banco.from(tabela).select('*').eq(campo, valor).order(chave)
      .range(linhas.length, linhas.length + pagina - 1)
    if (error) throw error
    linhas.push(...data)
    if (data.length < pagina) return linhas
  }
}

export async function carregarClientesSb(unidadeId: string): Promise<{ clientes: Cliente[]; paineis: Map<string, Painel> }> {
  const [c, p] = await Promise.all([
    listar('clientes', 'unidade_id', unidadeId),
    listar('cliente_paineis', 'unidade_id', unidadeId),
  ])
  const clientes = c.map(mapClienteSb).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const atuais = new Set(clientes.map((cliente) => cliente.painelToken))
  const paineis = new Map<string, Painel>()
  for (const linha of p) {
    const token = texto(linha.token)
    if (!atuais.has(token)) continue
    const painel = mapPainelSb(token, linha)
    paineis.set(painel.clienteId, painel)
  }
  return { clientes, paineis }
}

export async function carregarItensSb(token: string): Promise<ItensPainel> {
  const [c, v, r] = await Promise.all([
    listar('cliente_painel_cobrancas', 'painel_token', token),
    listar('cliente_painel_visitas', 'painel_token', token),
    listar('cliente_painel_recados', 'painel_token', token),
  ])
  return mapItens(c, v, r)
}

export async function carregarCobrancasDaUnidadeSb(paineis: Map<string, Painel>): Promise<Map<string, Cobranca[]>> {
  const pares = await Promise.all([...paineis.values()].map(async (p) => {
    const cobrancas = await listar('cliente_painel_cobrancas', 'painel_token', p.token)
    return [p.clienteId, cobrancas.map(mapCobrancaSb)] as const
  }))
  return new Map(pares)
}

type PainelPublico = Linha & { cobrancas: Linha[]; visitas: Linha[]; recados: Linha[] }

export async function carregarPainelPublicoSb(token: string): Promise<{ painel: Painel; itens: ItensPainel } | null> {
  if (!tokenValido(token)) return null
  try {
    const { data, error } = await requireSupabase().rpc('painel_publico', { p_token: token })
    if (error || !data) return null
    const publico = data as PainelPublico
    return {
      painel: mapPainelSb(token, { ...publico, ativo: true }),
      itens: mapItens(publico.cobrancas, publico.visitas, publico.recados),
    }
  } catch {
    return null
  }
}

export async function lerPainelPublicoSb(token: string): Promise<Painel | null> {
  return (await carregarPainelPublicoSb(token))?.painel ?? null
}

export async function lancarCobrancaSb(painel: Painel, c: Omit<Cobranca, 'id'>): Promise<void> {
  const { error } = await requireSupabase().from('cliente_painel_cobrancas').insert({
    painel_token: painel.token, id: c.competencia, competencia: c.competencia,
    valor_centavos: c.valorCentavos, vencimento: c.vencimento, status: c.status, pago_em: c.pagoEm,
  })
  if (error?.code === '23505') throw new Error('Já existe cobrança para esse mês.')
  if (error) throw error
}

async function atualizarItem(tabela: TabelaItem, token: string, id: string, campos: Linha): Promise<void> {
  const { error } = await requireSupabase().from(tabela).update(campos)
    .eq('painel_token', token).eq('id', id).select('id').single()
  if (error) throw error
}

export function marcarCobrancaSb(painel: Painel, competencia: string, pago: boolean, dia: string): Promise<void> {
  return atualizarItem('cliente_painel_cobrancas', painel.token, competencia, {
    status: pago ? 'pago' : 'pendente', pago_em: pago ? dia : '',
  })
}

export async function agendarVisitaSb(painel: Painel, v: Omit<Visita, 'id' | 'status'>): Promise<void> {
  const { error } = await requireSupabase().from('cliente_painel_visitas').insert({
    painel_token: painel.token, data: v.data, hora: v.hora, motivo: v.motivo.trim().slice(0, 200), status: 'agendada',
  })
  if (error) throw error
}

export function mudarVisitaSb(painel: Painel, id: string, status: Exclude<StatusVisita, 'agendada'>): Promise<void> {
  return atualizarItem('cliente_painel_visitas', painel.token, id, { status })
}

export async function publicarRecadoSb(painel: Painel, r: { texto: string; autor: string; geradoPorIA: boolean; iaModelo: string }): Promise<void> {
  const { error } = await requireSupabase().from('cliente_painel_recados').insert({
    painel_token: painel.token, texto: r.texto.trim().slice(0, 500),
    gerado_por_ia: r.geradoPorIA, ia_modelo: r.geradoPorIA ? r.iaModelo.trim().slice(0, 80) : '',
  })
  if (error) throw error
}

const dataMeioDia = (dia: string) => new Date(`${dia}T12:00:00`).toISOString()
const contrato = (f: ClienteForm) => ({
  box: f.box.trim().slice(0, 60),
  contrato_inicio: dataMeioDia(f.contratoInicio),
  contrato_fim: f.contratoFim ? dataMeioDia(f.contratoFim) : null,
  valor_mensal_centavos: centavos(f.valorMensal),
  dia_vencimento: Number(f.diaVencimento),
})
const pessoais = (f: ClienteForm) => ({
  nome: f.nome.trim().slice(0, 120), telefone: f.telefone.trim().slice(0, 30),
  email: f.email.trim().slice(0, 120), obs: f.obs.trim().slice(0, 1000),
})

export async function criarClienteSb(autor: Usuario, f: ClienteForm, contatoUnidade: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc('criar_cliente', {
    p_id: crypto.randomUUID(), p_token: gerarToken(),
    p_cliente: { ...pessoais(f), ...contrato(f), unidade_id: autor.unidadeId ?? '', status: 'ativo' },
    p_painel: {
      ...contrato(f), unidade_nome: autor.unidade ?? '', contato_unidade: contatoUnidade.trim().slice(0, 120),
      primeiro_nome: primeiroNomeDe(f.nome), ativo: false,
    },
  })
  if (error) throw error
  return data
}

export async function salvarClienteSb(cliente: Cliente, f: ClienteForm, status: Cliente['status']): Promise<void> {
  const { error } = await requireSupabase().rpc('salvar_cliente', {
    p_id: cliente.id, p_token: cliente.painelToken, p_dados: { ...pessoais(f), ...contrato(f), status },
    p_primeiro_nome: primeiroNomeDe(f.nome),
  })
  if (error) throw error
}

export async function atualizarPainelSb(painel: Painel, m: MudancaPainel): Promise<void> {
  const { error } = await requireSupabase().from('cliente_paineis').update({
    ...(m.ativo === undefined ? {} : { ativo: m.ativo }),
    ...(m.contatoUnidade === undefined ? {} : { contato_unidade: m.contatoUnidade }),
  }).eq('token', painel.token).select('token').single()
  if (error) throw error
}

export async function trocarLinkSb(cliente: Cliente, painel: Painel): Promise<string> {
  const { data, error } = await requireSupabase().rpc('trocar_link_cliente', {
    p_id: cliente.id, p_token_atual: painel.token, p_token_novo: gerarToken(),
  })
  if (error) throw error
  return data
}
