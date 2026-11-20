// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tratarLinkSenha } from './linkSenha'

const raiz = '/ubox-portal-franqueado/'
const token = 'token_ficticio-123'

function abrir(query: string) {
  const location = { pathname: raiz, hash: '#/entrar', search: query }
  const history = {
    state: null,
    replaceState: vi.fn((_state, _title, url: string) => {
      const endereco = new URL(url, 'https://example.com')
      Object.assign(location, { pathname: endereco.pathname, hash: endereco.hash, search: endereco.search })
    }),
  }
  const verifyOtp = vi.fn(async (_params: { token_hash: string; type: 'recovery' }) => ({ error: null as Error | null }))
  const executar = () => tratarLinkSenha({ location, history }, () => ({ auth: { verifyOtp } }))
  return { location, history, verifyOtp, executar }
}

afterEach(() => vi.restoreAllMocks())

describe('link de recuperação do Supabase', () => {
  it('limpa a URL antes de verificar uma única vez e descarta redirecionamentos', async () => {
    const { history, verifyOtp, executar } = abrir(
      `?token_hash=${token}&type=recovery&redirect=https://example.net&next=/fora&url=https://example.net`,
    )
    let urlNaVerificacao: unknown
    verifyOtp.mockImplementationOnce(async () => {
      urlNaVerificacao = history.replaceState.mock.lastCall?.[2]
      return { error: null }
    })

    expect(await executar()).toBe('recuperacao')
    expect(await executar()).toBe('ausente')
    expect(urlNaVerificacao).toBe(`${raiz}#/entrar`)
    expect(verifyOtp).toHaveBeenCalledExactlyOnceWith({ token_hash: token, type: 'recovery' })
    expect(history.replaceState).toHaveBeenCalledTimes(1)
  })

  it.each([
    [token, 'signup'],
    [token, 'Recovery'],
    ['curto', 'recovery'],
    ['token%2Finvalido', 'recovery'],
    ['', 'recovery'],
    ['x'.repeat(257), 'recovery'],
  ])('recusa parâmetros inválidos antes de chamar o Supabase (%s, %s)', async (hash, tipo) => {
    const { history, verifyOtp, executar } = abrir(`?token_hash=${hash}&type=${tipo}`)
    expect(await executar()).toBe('invalido')
    expect(history.replaceState).toHaveBeenNthCalledWith(1, null, '', `${raiz}#/entrar`)
    expect(history.replaceState).toHaveBeenLastCalledWith(null, '', `${raiz}#/recuperar`)
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it.each(['resposta', 'exceção'])('volta à recuperação sem registrar o token em caso de %s', async (falha) => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const)
      .map((metodo) => vi.spyOn(console, metodo).mockImplementation(() => {}))
    const { location, verifyOtp, executar } = abrir(`?token_hash=${token}&type=recovery`)
    const erro = new Error(token)
    if (falha === 'resposta') verifyOtp.mockResolvedValueOnce({ error: erro })
    else verifyOtp.mockRejectedValueOnce(erro)

    expect(await executar()).toBe('invalido')
    expect(location.hash).toBe('#/recuperar')
    expect(location.search).toBe('')
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
  })

  it('preserva a query com o código PKCE', async () => {
    const { history, verifyOtp, executar } = abrir('?code=codigo-ficticio')
    expect(await executar()).toBe('ausente')
    expect(history.replaceState).not.toHaveBeenCalled()
    expect(verifyOtp).not.toHaveBeenCalled()
  })
})
