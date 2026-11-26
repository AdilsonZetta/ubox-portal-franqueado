import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'
import { listarMeuProgresso, listarTrilhaManuais } from './manuaisApi'
import { acessoAoManual, proximoPassoDaTrilha, fazTrilha, veTodosOsManuais, type AcessoManual, type ItemTrilhaManual, type ProgressoManual } from './manuaisTrilha'
import { useVisao } from './visao'

/** Carrega a trilha e o progresso da pessoa (ou da simulada) para decidir se um manual abre. */
export function useAcessoTrilha(): { carregando: boolean; acesso: (documentoId: string) => AcessoManual; proximoPasso: (documentoId: string) => ItemTrilhaManual | null } {
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const veTudo = veTodosOsManuais(user, comoFranqueado)
  const [itens, setItens] = useState<ItemTrilhaManual[]>([])
  const [progressos, setProgressos] = useState<ProgressoManual[]>([])
  const [carregando, setCarregando] = useState(true)
  const uid = pessoa?.uid ?? ''
  const participa = fazTrilha(pessoa)

  useEffect(() => {
    if (!user || !uid) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    void Promise.all([
      listarTrilhaManuais().catch(() => [] as ItemTrilhaManual[]),
      participa && !veTudo ? listarMeuProgresso(uid).catch(() => [] as ProgressoManual[]) : Promise.resolve([] as ProgressoManual[]),
    ])
      .then(([trilha, meus]) => {
        if (!ativo) return
        setItens(trilha)
        setProgressos(meus)
      })
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, uid, participa, veTudo])

  const acesso = useCallback((documentoId: string) => acessoAoManual(documentoId, itens, progressos, veTudo), [itens, progressos, veTudo])
  const proximoPasso = useCallback((documentoId: string) => veTudo ? null : proximoPassoDaTrilha(documentoId, itens, progressos), [veTudo, itens, progressos])
  return { carregando, acesso, proximoPasso }
}
