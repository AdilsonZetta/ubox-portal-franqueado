function hex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function gerarToken() {
  return hex(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashToken(token: string) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
}
