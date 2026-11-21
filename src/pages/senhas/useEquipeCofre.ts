import { useEffect, useState } from 'react'
import { listarEquipeDaUnidade } from '../../lib/gestao'
import type { Usuario } from '../../types'

export function useEquipeCofre(unidadeId: string | null) {
  const [tentativa, setTentativa] = useState(0)
  const [leitura, setLeitura] = useState<{ unidadeId: string; tentativa: number; membros: Usuario[]; erro: boolean } | null>(null)

  useEffect(() => {
    if (!unidadeId) return
    let ativo = true
    void listarEquipeDaUnidade(unidadeId)
      .then((membros) => {
        if (ativo) setLeitura({ unidadeId, tentativa, membros, erro: false })
      })
      .catch(() => {
        if (ativo) setLeitura({ unidadeId, tentativa, membros: [], erro: true })
      })
    return () => { ativo = false }
  }, [unidadeId, tentativa])

  const atual = leitura?.unidadeId === unidadeId && leitura.tentativa === tentativa ? leitura : null
  return {
    membros: atual?.membros ?? [],
    carregando: Boolean(unidadeId && !atual),
    erro: Boolean(atual?.erro),
    recarregar: () => setTentativa((n) => n + 1),
  }
}
