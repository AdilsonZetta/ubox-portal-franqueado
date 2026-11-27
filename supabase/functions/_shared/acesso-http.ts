import { ORIGENS } from '../criar-conta/regras.ts'

export class ErroPedido extends Error {
  readonly status: number
  constructor(status: number, texto: string) {
    super(texto)
    this.status = status
  }
}

export function objeto(dados: unknown): Record<string, unknown> {
  return dados && typeof dados === 'object' && !Array.isArray(dados) ? dados as Record<string, unknown> : {}
}

export function identificador(valor: unknown) {
  if (typeof valor !== 'string' || !valor || valor.length > 80) throw new ErroPedido(400, 'Confira a unidade ou o cliente informado.')
  return valor
}

export function semPermissao(): never {
  throw new ErroPedido(403, 'Você não tem permissão para esta operação.')
}

export function endpoint(executar: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    const origem = req.headers.get('Origin')
    const headers = new Headers({
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    })
    if (origem && ORIGENS.includes(origem)) headers.set('Access-Control-Allow-Origin', origem)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    try {
      if (req.method !== 'POST') throw new ErroPedido(405, 'Método não permitido.')
      return Response.json(await executar(req), { headers })
    } catch (erro) {
      const status = erro instanceof ErroPedido ? erro.status : 500
      const texto = erro instanceof ErroPedido ? erro.message : 'Não foi possível concluir a operação. Tente novamente.'
      return Response.json({ erro: texto }, { status, headers })
    }
  }
}

export async function corpoJson(req: Request) {
  const corpo: unknown = await req.json().catch(() => null)
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroPedido(400, 'Pedido inválido.')
  return objeto(corpo)
}
