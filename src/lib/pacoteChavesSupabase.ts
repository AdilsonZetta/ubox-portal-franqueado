import { idChavePacote, type VinculoPacote } from './pacoteChaves'
import { requireSupabase } from './supabase'

export async function listarPacoteChavesSb(): Promise<VinculoPacote[]> {
  const banco = requireSupabase()
  const vinculos: VinculoPacote[] = []
  const limite = 500
  for (let inicio = 0; ; inicio += limite) {
    const { data, error } = await banco.from('pacote_chaves')
      .select('tipo,chave,alvo_id').order('chave_id').range(inicio, inicio + limite - 1)
    if (error) throw new Error(error.message)
    vinculos.push(...data.map(({ tipo, chave, alvo_id }) => ({ tipo, chave, alvoId: alvo_id })))
    if (data.length < limite) return vinculos
  }
}

export async function salvarPacoteChaveSb(vinculo: VinculoPacote, uid: string): Promise<void> {
  const { tipo, chave, alvoId } = vinculo
  const { error } = await requireSupabase().from('pacote_chaves').upsert({
    chave_id: idChavePacote(tipo, chave), tipo, chave, alvo_id: alvoId,
    atualizado_em: new Date().toISOString(), atualizado_por: uid,
  })
  if (error) throw new Error(error.message)
}
