import { useEffect, useState } from 'react'
import type { Usuario } from '../types'
import { listarCompartilhados } from './acompanhamentoApi'
import { daUnidade } from './auditoria'
import { listarAcoes } from './auditoriaApi'
import { montarCompromissos } from './compromissos'

async function carregarCompromissos(unidadeId: string, papel: string) {
  const [acoes, compartilhados] = await Promise.allSettled([
    listarAcoes(false, unidadeId),
    listarCompartilhados(unidadeId),
  ])
  return {
    itens: montarCompromissos({
      unidadeId,
      papel,
      agoraMs: Date.now(),
      acoes: acoes.status === 'fulfilled' ? acoes.value : [],
      passos: compartilhados.status === 'fulfilled' ? compartilhados.value.passos : [],
    }),
    falhas: [
      ...(acoes.status === 'rejected' ? ['Ações de auditoria'] : []),
      ...(compartilhados.status === 'rejected' ? ['Combinados'] : []),
    ],
  }
}

export function useCompromissos(pessoa: Usuario | null | undefined) {
  const [tentativa, setTentativa] = useState(0)
  const [carga, setCarga] = useState<{
    pessoa: Usuario
    tentativa: number
    dados: Awaited<ReturnType<typeof carregarCompromissos>>
  }>()
  const unidadeId = daUnidade(pessoa) ? pessoa?.unidadeId : undefined
  const habilitado = Boolean(unidadeId)

  useEffect(() => {
    if (!pessoa || !unidadeId) return
    let ativo = true
    void carregarCompromissos(unidadeId, pessoa.papel).then((dados) => {
      if (ativo) setCarga({ pessoa, tentativa, dados })
    })
    return () => {
      ativo = false
    }
  }, [pessoa, unidadeId, tentativa])

  const atual = habilitado && carga?.pessoa === pessoa ? carga : undefined
  return {
    habilitado,
    carregando: habilitado && atual?.tentativa !== tentativa,
    itens: atual?.dados.itens ?? [],
    falhas: atual?.dados.falhas ?? [],
    recarregar: () => setTentativa((valor) => valor + 1),
  }
}
