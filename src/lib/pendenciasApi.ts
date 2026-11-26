import { hojeISO, situacao } from './cliente'
import { carregarClientes, carregarCobrancasDaUnidade } from './clienteApi'
import { followUps } from './crm'
import { carregarUnidade } from './crmApi'

export async function contarFollowUpsAtrasados(unidadeId: string, agora: number) {
  return followUps((await carregarUnidade(unidadeId)).leads, agora).atrasados.length
}

export async function contarCobrancasAtrasadas(unidadeId: string, agora: number) {
  const { clientes, paineis } = await carregarClientes(unidadeId)
  const ativos = new Set(clientes.filter((c) => c.status === 'ativo').map((c) => c.id))
  const cobrancas = await carregarCobrancasDaUnidade(new Map([...paineis].filter(([id]) => ativos.has(id))))
  const hoje = hojeISO(agora)
  return [...cobrancas.values()].flat().filter((c) => situacao(c, hoje) === 'atrasado').length
}
