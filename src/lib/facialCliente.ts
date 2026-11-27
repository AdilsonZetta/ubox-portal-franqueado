import type { Cliente } from './cliente'
import { requireSupabase } from './supabase'

const BUCKET = 'cliente-faciais'
const VERSAO_CONSENTIMENTO = '2026-11-27-v1'
export const STATUS_FACIAL = {
  pendente_envio: 'Pendente de envio ao terminal',
  enviado: 'Enviada',
  erro: 'Erro no envio',
} as const

type Vinculo = Pick<Cliente, 'id' | 'unidadeId'>
export interface Facial {
  foto_path: string
  status: keyof typeof STATUS_FACIAL
}

export const arquivoFacialValido = (arquivo: File) =>
  (arquivo.type === 'image/jpeg' || arquivo.type === 'image/png') && arquivo.size > 0 && arquivo.size <= 5 * 1024 * 1024

export async function lerFacial(clienteId: string): Promise<Facial | null> {
  const { data, error } = await requireSupabase().from('cliente_faciais')
    .select('foto_path,status').eq('cliente_id', clienteId).maybeSingle()
  if (error) throw error
  return data as Facial | null
}

export async function assinarFoto(caminho: string): Promise<string> {
  const { data, error } = await requireSupabase().storage.from(BUCKET).createSignedUrl(caminho, 120)
  if (error) throw error
  return data.signedUrl
}

export async function salvarFacial(cliente: Vinculo, arquivo: File, anterior: string | undefined, origem: 'cliente' | 'unidade') {
  if (!arquivoFacialValido(arquivo)) throw new Error('Selecione uma foto JPG ou PNG de até 5 MB.')
  const sb = requireSupabase()
  const storage = sb.storage.from(BUCKET)
  const caminho = `${cliente.unidadeId}/${cliente.id}/${crypto.randomUUID()}.${arquivo.type === 'image/png' ? 'png' : 'jpg'}`
  const upload = await storage.upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (upload.error) throw upload.error
  const { error } = await sb.from('cliente_faciais').upsert({
    cliente_id: cliente.id, unidade_id: cliente.unidadeId, foto_path: caminho,
    consentimento_em: new Date().toISOString(), consentimento_texto_versao: VERSAO_CONSENTIMENTO,
    cadastrado_por: origem, status: 'pendente_envio',
  })
  if (error) {
    // Uma resposta de rede perdida pode ter sido precedida por um commit.
    const atual = await lerFacial(cliente.id).catch(() => undefined)
    if (atual === undefined) throw error
    if (atual?.foto_path !== caminho) {
      await storage.remove([caminho]).catch(() => undefined)
      throw error
    }
  }
  if (anterior && anterior !== caminho) await storage.remove([anterior]).catch(() => undefined)
}

export async function removerFotosEncerradas(cliente: Vinculo): Promise<void> {
  const storage = requireSupabase().storage.from(BUCKET)
  const prefixo = `${cliente.unidadeId}/${cliente.id}`
  const limite = 100
  // Remover pela API elimina também os bytes do objeto.
  for (;;) {
    const { data, error } = await storage.list(prefixo, { limit: limite })
    if (error || !data?.length) return
    const removidos = await storage.remove(data.map((foto) => `${prefixo}/${foto.name}`))
    if (removidos.error || removidos.data.length < data.length) return
  }
}
