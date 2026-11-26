// Módulo 10 — Controle de Estoque: tipos e regras puras (sem Firestore).

export const CATEGORIAS = ['insumos', 'cadeados', 'caixas', 'embalagens', 'limpeza', 'uniformes', 'outro'] as const
export type Categoria = (typeof CATEGORIAS)[number]
export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  insumos: 'Insumos',
  cadeados: 'Cadeados',
  caixas: 'Caixas de mudança',
  embalagens: 'Embalagens',
  limpeza: 'Material de limpeza',
  uniformes: 'Uniformes',
  outro: 'Outro',
}

export const UNIDADES_MEDIDA = ['un', 'cx', 'pct', 'par', 'kg', 'l', 'm', 'rolo'] as const
export type UnidadeMedida = (typeof UNIDADES_MEDIDA)[number]

export const TIPOS_MOV = ['entrada', 'saida', 'venda', 'ajuste'] as const
export type TipoMov = (typeof TIPOS_MOV)[number]
export const ROTULO_TIPO_MOV: Record<TipoMov, string> = { entrada: 'Entrada', saida: 'Saída', venda: 'Venda', ajuste: 'Ajuste' }
/** O que a unidade lança à mão (ajuste só nasce de uma contagem confirmada). */
export const TIPOS_MANUAIS = ['entrada', 'saida', 'venda'] as const
export type TipoManual = (typeof TIPOS_MANUAIS)[number]

export const ORIGENS = ['manual', 'contagem', 'pedido'] as const
export type Origem = (typeof ORIGENS)[number]

export const STATUS_PEDIDO = ['aberto', 'aprovado', 'enviado', 'recebido', 'cancelado'] as const
export type StatusPedido = (typeof STATUS_PEDIDO)[number]
export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  aberto: 'Aberto', aprovado: 'Aprovado', enviado: 'Enviado', recebido: 'Recebido', cancelado: 'Cancelado',
}

export const STATUS_CONTAGEM = ['aberta', 'confirmada', 'cancelada'] as const
export type StatusContagem = (typeof STATUS_CONTAGEM)[number]

export const QTD_MAX = 100_000
export const MAX_ITENS_CONTAGEM = 60
export const MAX_ITENS_PEDIDO = 40

export interface ItemEstoque {
  id: string
  nome: string
  codigo: string
  categoria: Categoria
  unidadeMedida: UnidadeMedida
  estoqueMinimo: number
  precoSugeridoCentavos: number
  descricao: string
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
  atualizadoPorNome: string
  atualizadoEmMs: number
}

export interface ItemForm {
  nome: string
  codigo: string
  categoria: Categoria
  unidadeMedida: UnidadeMedida
  estoqueMinimo: number
  preco: string
  descricao: string
  ativo: boolean
  geradoPorIA: boolean
  iaModelo: string
}

export interface Movimento {
  id: string
  unidadeId: string
  unidadeNome: string
  itemId: string
  itemNome: string
  unidadeMedida: string
  tipo: TipoMov
  quantidade: number
  delta: number
  motivo: string
  origem: Origem
  origemId: string
  indice: number
  uid: string
  nome: string
  criadoEmMs: number
}

export interface LinhaContagem {
  itemId: string
  itemNome: string
  unidadeMedida: string
  sistema: number
  contado: number | null
  diferenca: number
}

export interface Contagem {
  id: string
  unidadeId: string
  unidadeNome: string
  itens: LinhaContagem[]
  totalDivergencias: number
  obs: string
  status: StatusContagem
  criadoPorNome: string
  criadoEmMs: number
  confirmadoNome: string
  confirmadoEmMs: number
  atualizadoPorNome: string
  atualizadoEmMs: number
}

export interface LinhaPedido {
  itemId: string
  itemNome: string
  unidadeMedida: string
  quantidade: number
  quantidadeEnviada: number
}

export interface Pedido {
  id: string
  unidadeId: string
  unidadeNome: string
  itens: LinhaPedido[]
  status: StatusPedido
  obsUnidade: string
  obsFranqueadora: string
  solicitanteNome: string
  criadoEmMs: number
  aprovadoEmMs: number
  enviadoEmMs: number
  recebidoEmMs: number
  canceladoEmMs: number
  atualizadoPorNome: string
  atualizadoEmMs: number
}

/** O saldo vem só dos movimentos: soma dos deltas por item. */
export function saldos(movimentos: Pick<Movimento, 'itemId' | 'delta'>[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const m of movimentos) mapa.set(m.itemId, (mapa.get(m.itemId) ?? 0) + m.delta)
  return mapa
}

export type Nivel = 'ok' | 'baixo' | 'zerado' | 'sem_lancamento'

export function nivelEstoque(saldo: number, minimo: number): Nivel {
  if (saldo <= 0) return 'zerado'
  if (saldo < minimo) return 'baixo'
  return 'ok'
}

export interface LinhaSaldo {
  item: ItemEstoque
  saldo: number
  nivel: Nivel
}

/** Itens ativos (e inativos que ainda têm saldo), com o nível frente ao mínimo. Críticos primeiro. */
export function tabelaSaldos(itens: ItemEstoque[], movimentos: Pick<Movimento, 'itemId' | 'delta'>[], confirmadas: LinhaContagem[] = []): LinhaSaldo[] {
  const s = saldos(movimentos)
  const contados = new Set(confirmadas.filter((l) => l.contado != null).map((l) => l.itemId))
  const peso: Record<Nivel, number> = { zerado: 0, baixo: 1, ok: 2, sem_lancamento: 3 }
  return itens
    .filter((item) => item.ativo || (s.get(item.id) ?? 0) !== 0)
    .map((item) => {
      const saldo = s.get(item.id) ?? 0
      const nivel = !s.has(item.id) && !contados.has(item.id)
        ? 'sem_lancamento'
        : item.ativo ? nivelEstoque(saldo, item.estoqueMinimo) : 'ok'
      return { item, saldo, nivel }
    })
    .sort((a, b) => peso[a.nivel] - peso[b.nivel] || a.item.nome.localeCompare(b.item.nome, 'pt-BR'))
}

export function situacaoSaldo({ nivel, saldo }: LinhaSaldo): string {
  if (nivel === 'sem_lancamento') return 'Sem lançamento'
  if (nivel === 'zerado') return saldo === 0 ? 'Saldo zero' : 'Zerado'
  return nivel === 'baixo' ? 'Abaixo do mínimo' : 'OK'
}

export function alertas(linhas: LinhaSaldo[]): LinhaSaldo[] {
  return linhas.filter((l) => l.item.ativo && (l.nivel === 'baixo' || l.nivel === 'zerado'))
}

/** Delta com sinal a partir do tipo (ajuste já vem com sinal). */
export function deltaDe(tipo: TipoMov, quantidade: number): number {
  return tipo === 'entrada' ? quantidade : tipo === 'ajuste' ? quantidade : -quantidade
}

export function validarMovimento(tipo: TipoManual, quantidade: number, motivo: string, saldoAtual: number): string[] {
  const erros: string[] = []
  if (!Number.isInteger(quantidade) || quantidade <= 0) erros.push('Informe uma quantidade inteira maior que zero.')
  else if (quantidade > QTD_MAX) erros.push(`A quantidade passa do limite (${QTD_MAX}).`)
  if (tipo === 'saida' && motivo.trim().length < 2) erros.push('Diga o motivo da saída.')
  if ((tipo === 'saida' || tipo === 'venda') && quantidade > saldoAtual) erros.push(`O saldo atual é ${saldoAtual}; não dá para tirar ${quantidade}. Se o físico está diferente, faça uma contagem.`)
  return erros
}

/** Linhas da contagem: sistema = saldo atual, diferença = contado − sistema. */
export function linhasContagem(itens: ItemEstoque[], saldoAtual: Map<string, number>, contados: Record<string, number>): LinhaContagem[] {
  return itens
    .filter((item) => Object.prototype.hasOwnProperty.call(contados, item.id))
    .slice(0, MAX_ITENS_CONTAGEM)
    .map((item) => {
      const sistema = saldoAtual.get(item.id) ?? 0
      const contado = contados[item.id]
      return { itemId: item.id, itemNome: item.nome, unidadeMedida: item.unidadeMedida, sistema, contado, diferenca: contado - sistema }
    })
}

export function linhasDigitadas(itens: ItemEstoque[], saldoAtual: Map<string, number>, campos: Record<string, string>): LinhaContagem[] {
  return itens.map((item) => {
    const texto = campos[item.id]?.trim() ?? ''
    const contado = texto === '' ? null : /^\d+$/.test(texto) ? Number(texto) : NaN
    const sistema = saldoAtual.get(item.id) ?? 0
    return { itemId: item.id, itemNome: item.nome, unidadeMedida: item.unidadeMedida, sistema, contado, diferenca: contado === null ? 0 : contado - sistema }
  })
}

export function camposContagem(linhas: LinhaContagem[]): Record<string, string> {
  return Object.fromEntries(linhas.map((l) => [l.itemId, l.contado === null ? '' : String(l.contado)]))
}

/** Ao confirmar, o "sistema" é recalculado com o saldo do momento (movimentos podem ter entrado depois do início). */
export function recalcularContagem(linhas: LinhaContagem[], saldoAtual: Map<string, number>): LinhaContagem[] {
  return linhas.flatMap((l) => {
    if (l.contado === null) return []
    const sistema = saldoAtual.get(l.itemId) ?? 0
    return [{ ...l, sistema, diferenca: l.contado - sistema }]
  })
}

export function divergencias(linhas: LinhaContagem[]): number {
  return linhas.filter((l) => l.diferenca !== 0).length
}

export function validarContagem(linhas: LinhaContagem[], rascunho = false): string[] {
  const erros: string[] = []
  if (!rascunho && !linhas.some((l) => l.contado !== null)) erros.push('Conte pelo menos um item antes de confirmar.')
  if (linhas.length > MAX_ITENS_CONTAGEM) erros.push(`No máximo ${MAX_ITENS_CONTAGEM} itens por contagem.`)
  if (linhas.some((l) => l.contado !== null && (!Number.isInteger(l.contado) || l.contado < 0 || l.contado > QTD_MAX))) erros.push('As quantidades contadas precisam ser inteiras, de 0 a 100.000.')
  if (!rascunho && linhas.some((l) => Math.abs(l.diferenca) > QTD_MAX)) erros.push('Uma diferença passa do limite de 100.000.')
  if (!rascunho && linhas.some((l) => !Number.isInteger(l.sistema) || l.sistema < 0 || l.sistema > QTD_MAX)) erros.push('Há item com saldo do sistema negativo ou acima de 100.000; fale com a franqueadora antes de confirmar.')
  return erros
}

export function validarPedido(linhas: Pick<LinhaPedido, 'quantidade'>[]): string[] {
  const erros: string[] = []
  if (!linhas.length) erros.push('Escolha pelo menos um item.')
  if (linhas.length > MAX_ITENS_PEDIDO) erros.push(`No máximo ${MAX_ITENS_PEDIDO} itens por pedido.`)
  if (linhas.some((l) => !Number.isInteger(l.quantidade) || l.quantidade <= 0 || l.quantidade > QTD_MAX)) erros.push('Cada item precisa de uma quantidade inteira maior que zero.')
  return erros
}

/** Sugestão de reposição: o que falta para chegar ao dobro do mínimo. */
export function sugestaoReposicao(linhas: LinhaSaldo[]): { itemId: string; quantidade: number }[] {
  return linhas.filter((l) => l.item.ativo && l.nivel !== 'ok')
    .sort((a, b) => Number(b.saldo <= 0) - Number(a.saldo <= 0) || a.item.nome.localeCompare(b.item.nome, 'pt-BR'))
    .map((l) => ({ itemId: l.item.id, quantidade: Math.max(1, l.item.estoqueMinimo * 2 - Math.max(0, l.saldo)) }))
    .slice(0, MAX_ITENS_PEDIDO)
}

export function validarItem(f: ItemForm): string[] {
  const erros: string[] = []
  const nome = f.nome.trim()
  if (nome.length < 2 || nome.length > 120) erros.push('O nome precisa ter de 2 a 120 caracteres.')
  if (!Number.isInteger(f.estoqueMinimo) || f.estoqueMinimo < 0 || f.estoqueMinimo > QTD_MAX) erros.push('O estoque mínimo precisa ser inteiro, de 0 a 100.000.')
  if (centavosDe(f.preco) === null) erros.push('Preço sugerido inválido (use, por exemplo, 12,90).')
  if (f.geradoPorIA && f.iaModelo.trim().length < 2) erros.push('Diga qual IA/modelo ajudou a escrever o item.')
  return erros
}

/** "12,90" → 1290. Vazio vale 0. Inválido → null. */
export function centavosDe(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/i, '').replace(/\./g, '').replace(',', '.')
  if (!limpo) return 0
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null
  const valor = Math.round(Number(limpo) * 100)
  return valor <= 10_000_000 ? valor : null
}

export function formatarPreco(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)
}

/** Próximos passos que cada lado pode dar no pedido. */
export function acoesPedido(status: StatusPedido, lado: 'unidade' | 'rede'): StatusPedido[] {
  if (lado === 'unidade') {
    if (status === 'aberto') return ['cancelado']
    if (status === 'enviado') return ['recebido']
    return []
  }
  if (status === 'aberto') return ['aprovado', 'cancelado']
  if (status === 'aprovado') return ['enviado', 'cancelado']
  return []
}

export interface ResumoUnidadeEstoque {
  unidadeId: string
  unidadeNome: string
  situacao: 'Sem lançamento' | 'Com lançamentos'
  itensBaixos: number
  itensZerados: number
  pedidosAbertos: number
  ultimoMovimentoMs: number
  ultimaContagemMs: number
}

/** Usa o cadastro de unidades habilitadas, com fallback para as unidades do histórico. */
export function resumoRede(itens: ItemEstoque[], movimentos: Movimento[], pedidos: Pedido[], contagens: Contagem[], unidades?: { id: string; nome: string }[]): ResumoUnidadeEstoque[] {
  const confirmadas = contagens.filter((c) => c.status === 'confirmada')
  const nomes = new Map(unidades?.map((u) => [u.id, u.nome]))
  if (!unidades) {
    for (const x of [...movimentos, ...pedidos, ...contagens]) if (x.unidadeId && !nomes.has(x.unidadeId)) nomes.set(x.unidadeId, x.unidadeNome || x.unidadeId)
  }
  const ativos = itens.filter((i) => i.ativo)
  return [...nomes.entries()]
    .map(([unidadeId, unidadeNome]) => {
      const movs = movimentos.filter((m) => m.unidadeId === unidadeId)
      const contadas = confirmadas.filter((c) => c.unidadeId === unidadeId)
      const pedidosUnidade = pedidos.filter((p) => p.unidadeId === unidadeId)
      const linhas = tabelaSaldos(ativos, movs, contadas.flatMap((c) => c.itens))
      return {
        unidadeId,
        unidadeNome,
        situacao: movs.length || contadas.length || pedidosUnidade.length ? 'Com lançamentos' as const : 'Sem lançamento' as const,
        itensBaixos: linhas.filter((l) => l.nivel === 'baixo' || (l.nivel === 'zerado' && l.saldo < 0)).length,
        itensZerados: linhas.filter((l) => l.nivel === 'zerado' && l.saldo === 0).length,
        pedidosAbertos: pedidosUnidade.filter((p) => p.status === 'aberto' || p.status === 'aprovado' || p.status === 'enviado').length,
        ultimoMovimentoMs: movs.reduce((max, m) => Math.max(max, m.criadoEmMs), 0),
        ultimaContagemMs: contadas.reduce((max, c) => Math.max(max, c.confirmadoEmMs), 0),
      }
    })
    .sort((a, b) => b.itensZerados + b.itensBaixos - (a.itensZerados + a.itensBaixos) || a.unidadeNome.localeCompare(b.unidadeNome, 'pt-BR'))
}

export function podeGerirEstoque(
  usuario: { papel: string; ativo?: boolean; modulosLiberados?: string[] } | null | undefined,
  ehAdmin: boolean,
): boolean {
  if (!usuario) return false
  if (ehAdmin) return true
  return usuario.papel === 'equipe_franqueadora' && usuario.ativo !== false && (usuario.modulosLiberados ?? []).includes('estoque')
}

export function fazEstoque(usuario: { papel: string } | null | undefined): boolean {
  return usuario?.papel === 'franqueado' || usuario?.papel === 'equipe_franqueado'
}

export interface RascunhoContagem {
  itens: LinhaContagem[]
  obs: string
}

/** Uma fila por formulário, com o mesmo ID para todas as gravações após a abertura. */
export function criarFilaContagem(
  idAberto: string | null,
  gravar: (id: string | null, rascunho: RascunhoContagem) => Promise<string>,
) {
  let id = idAberto
  let fila = Promise.resolve()
  return {
    get id() { return id },
    salvar(rascunho: RascunhoContagem) {
      const resultado = fila.then(async () => {
        if (!id && !rascunho.itens.some((l) => l.contado !== null)) return null
        id = await gravar(id, rascunho)
        return id
      })
      fila = resultado.then(() => {}, () => {})
      return resultado
    },
  }
}
