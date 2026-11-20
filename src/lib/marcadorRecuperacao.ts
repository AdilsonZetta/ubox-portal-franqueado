// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

const chave = 'ubox:recuperando-senha'
const chaveConcluida = 'ubox:recuperacao-concluida'

type Sessao = { access_token: string }

function acessarMarcador<T>(acao: (storage: Storage) => T): T | undefined {
  try {
    return acao(window.sessionStorage)
  } catch {
    // O navegador pode bloquear o armazenamento da sessão.
    return undefined
  }
}

export function iniciarRecuperacao() {
  acessarMarcador(storage => storage.setItem(chave, '1'))
}

export function limparRecuperacao() {
  acessarMarcador(storage => {
    storage.removeItem(chave)
    storage.removeItem(chaveConcluida)
  })
}

function decodificarPayload(token: string): { amr?: unknown; session_id?: unknown } | null {
  const partes = token.split('.')
  if (partes.length !== 3 || partes.some(parte => !/^[A-Za-z0-9_-]+$/.test(parte))) return null
  try {
    const bytes = Uint8Array.from(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return null
  }
}

export function concluirRecuperacao(sessao: Sessao | null) {
  const id = sessao && decodificarPayload(sessao.access_token)?.session_id
  acessarMarcador(storage => {
    storage.removeItem(chave)
    if (typeof id === 'string' && id) storage.setItem(chaveConcluida, id)
  })
}

export function restaurarRecuperacao(sessao: Sessao | null): boolean {
  if (!sessao) {
    limparRecuperacao()
    return false
  }
  if (acessarMarcador(storage => storage.getItem(chave)) === '1') return true
  const payload = decodificarPayload(sessao.access_token)
  const id = payload?.session_id
  if (typeof id === 'string' && id && acessarMarcador(storage => storage.getItem(chaveConcluida)) === id) return false
  if (!Array.isArray(payload?.amr) || !payload.amr.some(
    (entrada: { method?: unknown } | null) => entrada?.method === 'recovery' || entrada?.method === 'otp',
  )) return false
  iniciarRecuperacao()
  return true
}
