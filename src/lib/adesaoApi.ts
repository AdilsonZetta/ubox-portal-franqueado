import { doc, getDoc } from 'firebase/firestore'
import type { Usuario } from '../types'
import type { Designado } from './adesao'
import { listarUsuarios } from './api'
import { BACKEND } from './backend'
import { requireDb } from './firebase'
import { listarEquipeDaUnidade, listarUnidades } from './gestao'
import { requireSupabase } from './supabase'

type LinhaDesignado = { uid: string; nome: string; unidade_id: string; unidade_nome: string }
type UnidadeRelatorio = { id: string; nome: string }

async function listarRpc<T>(rpc: 'designados_manuais' | 'designados_universidade' | 'unidades_do_estoque', chave: string): Promise<T[]> {
  const linhas: T[] = []
  for (;;) {
    const { data, error } = await requireSupabase().rpc(rpc).order(chave).range(linhas.length, linhas.length + 499)
    if (error) throw error
    const pagina = (data ?? []) as T[]
    linhas.push(...pagina)
    if (pagina.length < 500) return linhas
  }
}

/** null sinaliza que só o histórico está disponível para o relatório. */
export async function listarDesignados(modulo: 'manuais' | 'universidade', autor: Usuario): Promise<Designado[] | null> {
  try {
    if (BACKEND === 'supabase') {
      const linhas = await listarRpc<LinhaDesignado>(`designados_${modulo}`, 'uid')
      return linhas.map((l) => ({ uid: l.uid, nome: l.nome, unidadeId: l.unidade_id, unidadeNome: l.unidade_nome }))
    }

    let pessoas: Usuario[]
    let unidades: UnidadeRelatorio[]
    if (autor.papel === 'franqueado' && autor.unidadeId) {
      const id = autor.unidadeId
      const [equipe, unidade] = await Promise.all([
        listarEquipeDaUnidade(id),
        getDoc(doc(requireDb(), 'unidades', id)),
      ])
      pessoas = [autor, ...equipe]
      unidades = unidade.data()?.ativo === true ? [{ id, nome: String(unidade.data()?.nome ?? '') }] : []
    } else if (autor.papel === 'admin') {
      const [usuarios, cadastro] = await Promise.all([listarUsuarios(), listarUnidades()])
      pessoas = usuarios
      unidades = cadastro.filter((u) => u.ativo)
    } else {
      return null
    }

    const nomes = new Map(unidades.map((u) => [u.id, u.nome]))
    return pessoas.flatMap((p) => {
      const unidadeId = p.unidadeId ?? ''
      const unidadeNome = nomes.get(unidadeId)
      if (!p.ativo || p.recusado || unidadeNome === undefined || !p.modulosLiberados?.includes(modulo)
        || (p.papel !== 'franqueado' && p.papel !== 'equipe_franqueado')) return []
      return [{ uid: p.uid, nome: p.nome, unidadeId, unidadeNome }]
    })
  } catch {
    return null
  }
}

export async function listarUnidadesComEstoque(): Promise<UnidadeRelatorio[] | null> {
  try {
    if (BACKEND === 'supabase') return await listarRpc<UnidadeRelatorio>('unidades_do_estoque', 'id')
    const unidades = await listarUnidades()
    return unidades.filter((u) => u.ativo && u.modulosLiberados?.includes('estoque')).map(({ id, nome }) => ({ id, nome }))
  } catch {
    return null
  }
}
