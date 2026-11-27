export const normalizarCpf = (cpf: string) => cpf.replace(/\D/g, '')

export function cpfValido(cpf: string): boolean {
  if (!/^[\d.\s-]+$/.test(cpf)) return false
  const digitos = normalizarCpf(cpf)
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false
  for (const posicao of [9, 10]) {
    let soma = 0
    for (let i = 0; i < posicao; i++) soma += Number(digitos[i]) * (posicao + 1 - i)
    if ((soma * 10) % 11 % 10 !== Number(digitos[posicao])) return false
  }
  return true
}

export async function emailCliente(cpf: string, unidadeId: string, clienteId?: string): Promise<string> {
  const nome = unidadeId.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 14)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([unidadeId, clienteId])))
  const sufixo = Array.from(new Uint8Array(hash).slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `c${normalizarCpf(cpf)}.${nome}-${sufixo}@clientes.ubox.local`
}
