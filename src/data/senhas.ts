export const DIAS_ROTACAO = 90
export const MS_POR_DIA = 24 * 60 * 60 * 1000
export const MAX_VISIVEL_PARA = 20

export const TEXTO_EVENTO_ACESSO = {
  criacao: 'Acesso criado.',
  atualizacao: 'Acesso atualizado.',
  permissao: 'Permissão alterada.',
  troca_senha: 'Senha trocada.',
  revelou: 'Visualizou a senha.',
  copiou: 'Copiou a senha.',
} as const

export const CATEGORIAS_ACESSO = [
  { id: 'gestao', nome: 'Gestão' },
  { id: 'email', nome: 'E-mail corporativo' },
  { id: 'redes_sociais', nome: 'Redes sociais' },
  { id: 'portaria', nome: 'Portaria e tags' },
  { id: 'cameras', nome: 'Câmeras' },
  { id: 'outros', nome: 'Outros' },
] as const

export const ESCOPOS_ACESSO = [
  { id: 'unidade', nome: 'Unidade' },
  { id: 'rede', nome: 'Rede' },
] as const

export const TIPOS_SOLICITACAO = [
  { id: 'pedir_acesso', nome: 'Pedir acesso' },
  { id: 'novo_sistema', nome: 'Novo sistema' },
  { id: 'revogar', nome: 'Revogar acesso' },
  { id: 'trocar_senha', nome: 'Trocar senha' },
] as const

export const STATUS_SOLICITACAO = [
  { id: 'aberta', nome: 'Em aberto' },
  { id: 'aprovada', nome: 'Aprovada' },
  { id: 'recusada', nome: 'Recusada' },
  { id: 'concluida', nome: 'Concluída' },
] as const

export const TIPOS_EVENTO_ACESSO = [
  { id: 'criacao', nome: 'Criação' },
  { id: 'atualizacao', nome: 'Atualização' },
  { id: 'revelou', nome: 'Revelou senha' },
  { id: 'copiou', nome: 'Copiou senha' },
  { id: 'permissao', nome: 'Permissão alterada' },
  { id: 'troca_senha', nome: 'Senha trocada' },
] as const

export type CategoriaAcesso = (typeof CATEGORIAS_ACESSO)[number]['id']
export type EscopoAcesso = (typeof ESCOPOS_ACESSO)[number]['id']
export type TipoSolicitacaoAcesso = (typeof TIPOS_SOLICITACAO)[number]['id']
export type StatusSolicitacaoAcesso = (typeof STATUS_SOLICITACAO)[number]['id']
export type TipoEventoAcesso = (typeof TIPOS_EVENTO_ACESSO)[number]['id']

export function nomeCategoriaAcesso(categoria: string): string {
  return CATEGORIAS_ACESSO.find((item) => item.id === categoria)?.nome ?? categoria
}

export function nomeTipoSolicitacao(tipo: string): string {
  return TIPOS_SOLICITACAO.find((item) => item.id === tipo)?.nome ?? tipo
}

export function nomeStatusSolicitacao(status: string): string {
  return STATUS_SOLICITACAO.find((item) => item.id === status)?.nome ?? status
}

export function nomeTipoEvento(tipo: string): string {
  return TIPOS_EVENTO_ACESSO.find((item) => item.id === tipo)?.nome ?? tipo
}

export function textoEventoAcesso(tipo: string): string {
  return TEXTO_EVENTO_ACESSO[tipo as keyof typeof TEXTO_EVENTO_ACESSO] ?? tipo
}

export function senhaVencida(ultimaTrocaEmMillis: number, agora = Date.now(), pendenteTroca = false): boolean {
  if (pendenteTroca) return true
  if (!ultimaTrocaEmMillis || ultimaTrocaEmMillis <= 0) return true
  return agora - ultimaTrocaEmMillis > DIAS_ROTACAO * MS_POR_DIA
}

export interface ItemAcessoBasico {
  escopo: EscopoAcesso
  unidadeId: string
  visivelPara: string[]
  visivelParaEquipe: boolean
  ultimaTrocaEmMillis: number
  pendenteTroca?: boolean
}

export function usuarioPodeVerSegredo(
  usuario: { uid: string; papel: string; unidadeId?: string | null; modulosLiberados?: string[] },
  acesso: ItemAcessoBasico,
  comoFranqueado = false,
): boolean {
  // Em modo simulação (comoFranqueado), nunca revela senhas
  if (comoFranqueado) return false

  const temModuloSenhas = Boolean(usuario.modulosLiberados?.includes('senhas'))
  const ehAdmin = usuario.papel === 'admin'
  const ehEquipeRede = usuario.papel === 'equipe_franqueadora'

  if (acesso.escopo === 'rede') {
    if (ehAdmin) return true
    if (ehEquipeRede && temModuloSenhas) return true
    // Franqueado ou equipe de unidade com módulo senhas
    if (temModuloSenhas && (usuario.papel === 'franqueado' || usuario.papel === 'equipe_franqueado')) return true
    return false
  }

  // Acesso de unidade
  if (ehAdmin || ehEquipeRede) {
    // Admin e franqueadora não leem segredo de unidade (apenas metadados)
    return false
  }

  // Precisa ser da mesma unidade e ter o módulo senhas
  if (!temModuloSenhas || !usuario.unidadeId || usuario.unidadeId !== acesso.unidadeId) {
    return false
  }

  if (usuario.papel === 'franqueado') {
    return true
  }

  if (usuario.papel === 'equipe_franqueado') {
    return acesso.visivelParaEquipe || acesso.visivelPara.includes(usuario.uid)
  }

  return false
}

export function contarPessoasComAcesso(
  acessos: { visivelPara: string[]; visivelParaEquipe: boolean }[],
  uidsEquipeUnidade: string[] = [],
  uidFranqueado?: string | null,
): number {
  const pessoas = new Set<string>()
  if (uidFranqueado) pessoas.add(uidFranqueado)

  for (const acesso of acessos) {
    if (acesso.visivelParaEquipe) {
      for (const uid of uidsEquipeUnidade) pessoas.add(uid)
    }
    for (const uid of acesso.visivelPara) {
      pessoas.add(uid)
    }
  }

  return pessoas.size
}

export function acessosParaIndicadores<T extends { escopo: string }>(acessos: T[], visaoRede: boolean): T[] {
  return visaoRede ? acessos.filter((item) => item.escopo === 'rede') : acessos
}

/**
 * Lista da tabela do cofre: parte da mesma base dos indicadores (na visão da rede só os
 * sistemas de escopo rede) e aplica categoria e busca por nome, responsável ou categoria.
 */
export function filtrarAcessosCofre<T extends { escopo: string; nome: string; responsavelNome: string; categoria: string }>(
  acessos: T[],
  filtro: { visaoRede: boolean; categoria?: string; busca?: string },
): T[] {
  const termo = (filtro.busca ?? '').trim().toLowerCase()
  return acessosParaIndicadores(acessos, filtro.visaoRede).filter((item) => {
    if (filtro.categoria && item.categoria !== filtro.categoria) return false
    if (!termo) return true
    return (
      item.nome.toLowerCase().includes(termo) ||
      item.responsavelNome.toLowerCase().includes(termo) ||
      nomeCategoriaAcesso(item.categoria).toLowerCase().includes(termo)
    )
  })
}

export function podeGerenciarAcesso(
  usuario: { papel: string; unidadeId?: string | null; modulosLiberados?: string[] },
  acesso: { escopo: string; unidadeId: string },
  comoFranqueado = false,
): boolean {
  if (comoFranqueado) return false
  if (acesso.escopo === 'unidade') {
    return usuario.papel === 'franqueado' && usuario.unidadeId === acesso.unidadeId
  }
  if (acesso.escopo === 'rede') {
    if (usuario.papel === 'admin') return true
    return usuario.papel === 'equipe_franqueadora' && Boolean(usuario.modulosLiberados?.includes('senhas'))
  }
  return false
}
