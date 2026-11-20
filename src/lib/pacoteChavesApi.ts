import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { BACKEND } from './backend'
import { requireDb } from './firebase'
import { idChavePacote, type VinculoPacote } from './pacoteChaves'
import { listarPacoteChavesSb, salvarPacoteChaveSb } from './pacoteChavesSupabase'

export async function listarPacoteChaves(): Promise<VinculoPacote[]> {
  if (BACKEND === 'supabase') return listarPacoteChavesSb()
  const snap = await getDocs(collection(requireDb(), 'pacoteChaves'))
  return snap.docs.map((d) => {
    const { tipo, chave, alvoId } = d.data()
    return { tipo, chave, alvoId }
  })
}

export async function salvarPacoteChave(vinculo: VinculoPacote, uid: string): Promise<void> {
  if (BACKEND === 'supabase') return salvarPacoteChaveSb(vinculo, uid)
  await setDoc(doc(requireDb(), 'pacoteChaves', idChavePacote(vinculo.tipo, vinculo.chave)), {
    ...vinculo, atualizadoEm: serverTimestamp(), atualizadoPor: uid,
  })
}
