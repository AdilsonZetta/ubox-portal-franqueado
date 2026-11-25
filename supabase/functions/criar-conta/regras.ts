const DOMINIO_FRANQUEADORA = 'https://uboxfranqueadora.ubox.net.br'
export const ORIGENS = ['https://adilsonzetta.github.io', DOMINIO_FRANQUEADORA, 'http://localhost:5173', 'http://127.0.0.1:5173']
export const VALIDADE_LINK_SEGUNDOS = 3600

interface PerfilAlvo {
  id: string
  papel: string
  unidade_id?: string | null
}

interface PerfilChamador extends PerfilAlvo {
  ativo: boolean
  recusado: boolean
}

export function podeGerarLink(chamador: PerfilChamador, alvo: PerfilAlvo): boolean {
  if (chamador.ativo !== true || chamador.recusado === true || alvo.id === chamador.id || alvo.papel === 'admin') return false
  if (chamador.papel === 'admin') {
    return ['equipe_franqueadora', 'franqueado', 'equipe_franqueado'].includes(alvo.papel)
  }
  return chamador.papel === 'franqueado' && alvo.papel === 'equipe_franqueado'
    && Boolean(chamador.unidade_id) && chamador.unidade_id === alvo.unidade_id
}

export function montarLinkSenha(origem: string | null, token: string): string {
  const base = origem && ORIGENS.includes(origem) ? origem : ORIGENS[0]
  const url = new URL(base === DOMINIO_FRANQUEADORA ? '/' : '/ubox-portal-franqueado/', base)
  url.search = new URLSearchParams({ token_hash: token, type: 'recovery' }).toString()
  return url.href
}
