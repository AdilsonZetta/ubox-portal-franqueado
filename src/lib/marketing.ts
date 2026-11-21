/**
 * Lógica pura da Central de Marketing (módulo 6).
 * Sem Firebase aqui: vigência, filtros, calendário, validação e transições são testáveis no Vitest.
 * Os arquivos ficam fora do Firebase (Drive ou outro link https), coerente com o plano Spark.
 */

export const TIPOS_MATERIAL = ['arte', 'campanha', 'logo', 'marca', 'template', 'video', 'outro'] as const
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number]

export const ROTULO_TIPO: Record<TipoMaterial, string> = {
  arte: 'Arte',
  campanha: 'Peça de campanha',
  logo: 'Logo',
  marca: 'Manual da marca',
  template: 'Template de post',
  video: 'Vídeo',
  outro: 'Outro',
}

export const TIPOS_CAMPANHA = ['campanha', 'data_comemorativa', 'lancamento'] as const
export type TipoCampanha = (typeof TIPOS_CAMPANHA)[number]
export const ROTULO_CAMPANHA: Record<TipoCampanha, string> = {
  campanha: 'Campanha',
  data_comemorativa: 'Data comemorativa',
  lancamento: 'Lançamento',
}

export const TIPOS_PECA = ['post', 'story', 'banner', 'panfleto', 'fachada', 'video', 'outro'] as const
export type TipoPeca = (typeof TIPOS_PECA)[number]
export const ROTULO_PECA: Record<TipoPeca, string> = {
  post: 'Post de feed',
  story: 'Story',
  banner: 'Banner',
  panfleto: 'Panfleto',
  fachada: 'Fachada / sinalização',
  video: 'Vídeo',
  outro: 'Outro',
}

export const STATUS_PEDIDO = ['aberta', 'em_producao', 'aguardando_unidade', 'entregue', 'cancelada'] as const
export type StatusPedido = (typeof STATUS_PEDIDO)[number]
export const ROTULO_STATUS: Record<StatusPedido, string> = {
  aberta: 'Na fila',
  em_producao: 'Em produção',
  aguardando_unidade: 'Aguardando a unidade',
  entregue: 'Entregue',
  cancelada: 'Cancelado',
}

export interface MaterialMkt {
  id: string
  titulo: string
  descricao: string
  tipo: TipoMaterial
  categoria: string
  campanhaId: string
  url: string
  previaUrl: string
  formato: string
  regrasUso: string
  validoDeMs: number | null
  validoAteMs: number | null
  publico: boolean
  unidades: string[]
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
  atualizadoPorNome: string
  atualizadoEmMs: number
}

export interface CampanhaMkt {
  id: string
  titulo: string
  descricao: string
  tipo: TipoCampanha
  inicioMs: number
  fimMs: number
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
}

export interface PedidoMkt {
  id: string
  uid: string
  nome: string
  unidadeId: string
  unidadeNome: string
  titulo: string
  tipoPeca: TipoPeca
  descricao: string
  medidas: string
  prazoDesejadoMs: number | null
  referenciaUrl: string
  campanhaId: string
  status: StatusPedido
  complemento: string
  resposta: string
  entregaUrl: string
  geradoPorIA: boolean
  iaModelo: string
  responsavelNome: string
  criadoEmMs: number
  atualizadoEmMs: number
  entregueEmMs: number | null
}

const DIA = 24 * 60 * 60 * 1000

export type Vigencia = 'vigente' | 'futuro' | 'vencido'

/** validoAte vale até o fim daquele dia. */
export function vigencia(m: Pick<MaterialMkt, 'validoDeMs' | 'validoAteMs'>, agoraMs: number): Vigencia {
  if (m.validoDeMs !== null && agoraMs < m.validoDeMs) return 'futuro'
  if (m.validoAteMs !== null && agoraMs >= m.validoAteMs + DIA) return 'vencido'
  return 'vigente'
}

export function linkHttpsValido(url: string): boolean {
  if (!/^https:\/\/\S+$/.test(url) || url.length > 600) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

export interface FiltroMateriais {
  tipo?: TipoMaterial | 'todos'
  categoria?: string
  campanhaId?: string
  busca?: string
  incluirForaDaVigencia?: boolean
  vigencia?: Vigencia
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Unidade vê só materiais ativos e vigentes; a franqueadora pode ver tudo. */
export function filtrarMateriais(materiais: MaterialMkt[], filtro: FiltroMateriais, agoraMs: number): MaterialMkt[] {
  const busca = normalizar(filtro.busca?.trim() ?? '')
  return materiais
    .filter((m) => filtro.incluirForaDaVigencia || (m.ativo && vigencia(m, agoraMs) === 'vigente'))
    .filter((m) => !filtro.vigencia || vigencia(m, agoraMs) === filtro.vigencia)
    .filter((m) => !filtro.tipo || filtro.tipo === 'todos' || m.tipo === filtro.tipo)
    .filter((m) => !filtro.categoria || m.categoria === filtro.categoria)
    .filter((m) => !filtro.campanhaId || m.campanhaId === filtro.campanhaId)
    .filter((m) => !busca || normalizar(`${m.titulo} ${m.descricao} ${m.categoria} ${m.formato}`).includes(busca))
    .sort((a, b) => b.atualizadoEmMs - a.atualizadoEmMs || a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export function categoriasDe(materiais: Pick<MaterialMkt, 'categoria'>[]): string[] {
  return [...new Set(materiais.map((m) => m.categoria.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Une a lista da rede com a da unidade sem repetir. */
export function mesclarMateriais(...listas: MaterialMkt[][]): MaterialMkt[] {
  const mapa = new Map<string, MaterialMkt>()
  for (const lista of listas) for (const m of lista) mapa.set(m.id, m)
  return [...mapa.values()]
}

/** Campanhas que tocam o mês (ano, mês 0-11), ordenadas pelo início. */
export function campanhasDoMes(campanhas: CampanhaMkt[], ano: number, mes: number): CampanhaMkt[] {
  const inicioMes = new Date(ano, mes, 1).getTime()
  const fimMes = new Date(ano, mes + 1, 1).getTime()
  return campanhas
    .filter((c) => c.inicioMs < fimMes && c.fimMs + DIA > inicioMes)
    .sort((a, b) => a.inicioMs - b.inicioMs || a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

/** Em andamento agora e as que começam nos próximos dias. */
export function proximasCampanhas(campanhas: CampanhaMkt[], agoraMs: number, dias = 45): CampanhaMkt[] {
  return campanhas
    .filter((c) => c.ativo && c.fimMs + DIA > agoraMs && c.inicioMs <= agoraMs + dias * DIA)
    .sort((a, b) => a.inicioMs - b.inicioMs)
}

export function situacaoCampanha(c: Pick<CampanhaMkt, 'inicioMs' | 'fimMs'>, agoraMs: number): 'em_andamento' | 'em_breve' | 'encerrada' {
  if (agoraMs < c.inicioMs) return 'em_breve'
  if (agoraMs >= c.fimMs + DIA) return 'encerrada'
  return 'em_andamento'
}

export interface MaterialForm {
  titulo: string
  descricao: string
  tipo: TipoMaterial
  categoria: string
  campanhaId: string
  url: string
  previaUrl: string
  formato: string
  regrasUso: string
  validoDe: string
  validoAte: string
  publico: boolean
  unidades: string[]
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
}

export function validarMaterial(f: MaterialForm): string[] {
  const erros: string[] = []
  if (f.titulo.trim().length < 2 || f.titulo.trim().length > 120) erros.push('O título precisa ter de 2 a 120 caracteres.')
  if (!linkHttpsValido(f.url.trim())) erros.push('O link do material precisa começar com https:// (por exemplo, um link do Google Drive).')
  if (f.previaUrl.trim() && !linkHttpsValido(f.previaUrl.trim())) erros.push('O link da prévia precisa começar com https://.')
  if (!f.publico && !f.unidades.length) erros.push('Escolha ao menos uma unidade ou deixe o material para a rede toda.')
  if (f.unidades.length > 30) erros.push('Um material pode ser direcionado a no máximo 30 unidades; acima disso, publique para a rede toda.')
  if (f.validoDe && f.validoAte && f.validoAte < f.validoDe) erros.push('A validade termina antes de começar.')
  if (f.geradoPorIA && f.iaModelo.trim().length < 2) erros.push('Informe qual IA ou modelo participou da criação.')
  if (f.categoria.length > 60) erros.push('A categoria aceita até 60 caracteres.')
  return erros
}

export interface PedidoForm {
  titulo: string
  tipoPeca: TipoPeca
  descricao: string
  medidas: string
  prazoDesejado: string
  referenciaUrl: string
  campanhaId: string
}

export function validarPedido(f: PedidoForm): string[] {
  const erros: string[] = []
  if (f.titulo.trim().length < 2 || f.titulo.trim().length > 120) erros.push('Dê um título de 2 a 120 caracteres.')
  if (f.descricao.trim().length < 10) erros.push('Descreva a peça com pelo menos 10 caracteres.')
  if (f.descricao.length > 2000) erros.push('A descrição aceita até 2000 caracteres.')
  if (f.referenciaUrl.trim() && !linkHttpsValido(f.referenciaUrl.trim())) erros.push('O link de referência precisa começar com https://.')
  return erros
}

/** Para onde a franqueadora pode levar o pedido (as rules exigem o mesmo). */
export function proximosStatusGestor(status: StatusPedido): StatusPedido[] {
  if (status === 'entregue' || status === 'cancelada') return []
  return (['em_producao', 'aguardando_unidade', 'entregue', 'cancelada'] as StatusPedido[]).filter((s) => s !== status)
}

/** A unidade cancela enquanto está na fila, ou responde quando a franqueadora pediu informação. */
export function acaoDaUnidade(status: StatusPedido): 'cancelar' | 'responder' | null {
  if (status === 'aberta') return 'cancelar'
  if (status === 'aguardando_unidade') return 'responder'
  return null
}

export function contarPorStatus(pedidos: Pick<PedidoMkt, 'status'>[]): Record<StatusPedido, number> {
  const base = Object.fromEntries(STATUS_PEDIDO.map((s) => [s, 0])) as Record<StatusPedido, number>
  for (const p of pedidos) base[p.status] += 1
  return base
}

export function podeGerirMarketing(
  usuario: { papel: string; ativo?: boolean; modulosLiberados?: string[] } | null | undefined,
  ehAdmin: boolean,
): boolean {
  if (!usuario) return false
  if (ehAdmin) return true
  return usuario.papel === 'equipe_franqueadora' && usuario.ativo !== false && (usuario.modulosLiberados ?? []).includes('marketing')
}

export function fazMarketing(usuario: { papel: string } | null | undefined): boolean {
  return usuario?.papel === 'franqueado' || usuario?.papel === 'equipe_franqueado'
}

/** "2026-12-25" → início do dia no fuso local. */
export function dataDoInput(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null
  const [a, m, d] = valor.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export function inputDaData(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
