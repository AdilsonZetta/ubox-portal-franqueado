import { useCallback } from 'react'
import { demandasDaUnidade } from '../../lib/demandas'
import { listarDemandas } from '../../lib/demandasSupabase'
import { useConsultaDemandas } from '../demandas/partes'
import { CartaoDemandas } from './MinhasDemandas'

export function DemandasUnidade({ unidadeId, franqueado, somenteLeitura }: {
  unidadeId: string; franqueado: boolean; somenteLeitura: boolean
}) {
  const consultar = useCallback(async () =>
    demandasDaUnidade(await listarDemandas(undefined, unidadeId), unidadeId), [unidadeId])
  const consulta = useConsultaDemandas(consultar)
  return <CartaoDemandas titulo="Demandas da franqueadora" consulta={consulta}
    destino={franqueado ? '/demandas?escopo=da-unidade' : '/demandas'}
    vazio={somenteLeitura ? 'Nenhuma demanda aberta na unidade simulada. Use “Ver todas” para consultar as concluídas.'
      : 'Nenhuma demanda aberta. Use “Ver todas” para consultar as concluídas.'} />
}
