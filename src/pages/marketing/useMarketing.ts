import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { fazMarketing, podeGerirMarketing, type CampanhaMkt, type MaterialMkt, type PedidoMkt } from '../../lib/marketing'
import { listarCampanhas, listarMateriais, listarPedidos } from '../../lib/marketingApi'
import { useVisao } from '../../lib/visao'
import type { Usuario } from '../../types'

export interface DadosMarketing {
  pessoa: Usuario | null
  gestor: boolean
  participa: boolean
  materiais: MaterialMkt[]
  campanhas: CampanhaMkt[]
  pedidos: PedidoMkt[]
  carregando: boolean
  erro: string
  recarregar: () => void
}

/** Materiais, campanhas e pedidos visíveis para quem está usando (a franqueadora vê tudo). */
export function useMarketing(opcoes: { pedidos?: boolean } = {}): DadosMarketing {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const gestor = podeGerirMarketing(user, ehAdmin) && !comoFranqueado
  const participa = fazMarketing(pessoa)
  const [materiais, setMateriais] = useState<MaterialMkt[]>([])
  const [campanhas, setCampanhas] = useState<CampanhaMkt[]>([])
  const [pedidos, setPedidos] = useState<PedidoMkt[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])
  const querPedidos = opcoes.pedidos === true

  useEffect(() => {
    if (!user || !pessoa) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    setErro('')
    // Na simulação, o admin lê como gestor e filtra como a unidade simulada veria.
    const comoGestor = gestor || (ehAdmin && comoFranqueado)
    void Promise.all([
      listarMateriais(pessoa, comoGestor),
      listarCampanhas(comoGestor),
      querPedidos && (gestor || participa) ? listarPedidos(pessoa, gestor) : Promise.resolve([] as PedidoMkt[]),
    ])
      .then(([m, c, p]) => {
        if (!ativo) return
        const unidade = pessoa.unidadeId ?? ''
        setMateriais(comoFranqueado ? m.filter((x) => x.ativo && (x.publico || x.unidades.includes(unidade))) : m)
        setCampanhas(comoFranqueado ? c.filter((x) => x.ativo) : c)
        setPedidos(p)
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, pessoa, gestor, participa, ehAdmin, comoFranqueado, querPedidos, tique])

  return { pessoa, gestor, participa, materiais, campanhas, pedidos, carregando, erro, recarregar }
}
