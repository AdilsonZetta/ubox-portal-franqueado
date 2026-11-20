// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

type ClienteRecuperacao = {
  auth: {
    verifyOtp(params: { token_hash: string; type: 'recovery' }): Promise<{ error: unknown }>
  }
}

type ResultadoLinkSenha = 'ausente' | 'recuperacao' | 'invalido'

export async function tratarLinkSenha(
  { location, history }: {
    location: Pick<Location, 'search' | 'pathname' | 'hash'>
    history: Pick<History, 'state' | 'replaceState'>
  },
  obterCliente: () => ClienteRecuperacao,
): Promise<ResultadoLinkSenha> {
  const query = new URLSearchParams(location.search)
  if (!query.has('token_hash') || !query.has('type')) return 'ausente'

  const { pathname, hash } = location
  history.replaceState(history.state, '', pathname + hash)

  const token_hash = query.get('token_hash') ?? ''
  const type = query.get('type')
  if (type === 'recovery' && /^[A-Za-z0-9_-]{8,256}$/.test(token_hash)) {
    try {
      const { error } = await obterCliente().auth.verifyOtp({ token_hash, type })
      if (!error) return 'recuperacao'
    } catch {
      // A falha recebe o mesmo aviso, sem expor detalhes da verificação.
    }
  }

  history.replaceState(history.state, '', pathname + '#/recuperar')
  return 'invalido'
}
