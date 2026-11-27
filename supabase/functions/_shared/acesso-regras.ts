export interface PerfilAcesso {
  id: string
  papel: string
  ativo: boolean
  recusado: boolean
  unidade_id?: string | null
  cliente_id?: string | null
  unidade_ativa?: boolean
  tem_modulo?: boolean
}

export function podeAcessar(perfil: PerfilAcesso | null, unidade: string, acao: string, cliente?: string) {
  if (!perfil?.ativo || perfil.recusado) return false
  if (perfil.papel === 'admin') return true
  if (perfil.papel === 'cliente') {
    return acao === 'listar_cobrancas' && !!cliente && perfil.cliente_id === cliente
  }
  return ['franqueado', 'equipe_franqueado'].includes(perfil.papel)
    && perfil.unidade_id === unidade && perfil.unidade_ativa === true && perfil.tem_modulo === true
}

export function statusAcesso(facial: boolean, manual: boolean, vencimentoMaisAntigo: string | null, tolerancia: number, hoje: string) {
  if (!facial) return 'Sem facial'
  if (manual) return 'Liberado manualmente'
  if (vencimentoMaisAntigo && Date.parse(vencimentoMaisAntigo) + tolerancia * 86_400_000 < Date.parse(hoje)) {
    return 'Bloqueado por inadimplência'
  }
  return 'Liberado'
}
