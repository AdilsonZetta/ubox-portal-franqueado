import { createClient } from 'npm:@supabase/supabase-js@2'
import { ErroPedido, semPermissao } from './acesso-http.ts'
import type { PerfilAcesso } from './acesso-regras.ts'

export function bancoServidor() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function resultado<T>({ data, error }: { data: T; error: { code?: string } | null }): T {
  if (error?.code === '42501') semPermissao()
  if (error?.code === '22023' || error?.code === '22007' || error?.code === '22008') {
    throw new ErroPedido(400, 'Confira os dados informados e tente novamente.')
  }
  if (error) throw new Error('Falha ao consultar o banco de dados.')
  return data
}

export async function autenticar(req: Request) {
  const token = /^Bearer (\S+)$/i.exec(req.headers.get('Authorization') ?? '')?.[1]
  if (!token) throw new ErroPedido(401, 'Entre no portal para continuar.')
  const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await usuario.auth.getUser(token)
  if (error || !data.user) throw new ErroPedido(401, 'Sessão inválida. Entre novamente.')
  const banco = bancoServidor()
  const perfil = resultado(await banco.rpc('ubox_acesso_perfil', { p_autor: data.user.id })) as PerfilAcesso | null
  if (!perfil?.ativo || perfil.recusado) return semPermissao()
  return { usuario, banco, perfil }
}
