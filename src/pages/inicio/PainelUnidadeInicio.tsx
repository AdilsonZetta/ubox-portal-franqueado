import { useCallback } from 'react'
import { Boxes, ClipboardCheck, GraduationCap, Headset, UsersRound } from 'lucide-react'
import { PedidosUnidade } from '../../components/PedidosUnidade'
import { Aviso } from '../../components/ui'
import { carregarAcompanhamento } from '../../lib/acompanhamentoApi'
import { carregarEstoque } from '../../lib/estoqueApi'
import { podeModulo } from '../../lib/modulosAcesso'
import { chamadosDoPainel, estoqueDoPainel, rotinasDeHoje, treinamentoDaUnidade } from '../../lib/painelInicial'
import { contarCobrancasAtrasadas, contarFollowUpsAtrasados } from '../../lib/pendenciasApi'
import { useVisao } from '../../lib/visao'
import type { Usuario } from '../../types'
import { CompromissosUnidade } from '../CompromissosUnidade'
import { CartaoUniversidade } from '../universidade/Universidade'
import { AcoesRapidas } from './AcoesRapidas'
import { PendenciasInicio } from './PendenciasInicio'
import { Indicadores, type Indicador } from './indicadores'
import { fontePainel, useDadosPainel } from './useDadosPainel'

export function PainelUnidadeInicio({ pessoa }: { pessoa: Usuario }) {
  const { comoFranqueado } = useVisao()
  const pessoal = pessoa.papel === 'equipe_franqueado'
  const unidadeId = pessoa.unidadeId
  const solicitanteUid = pessoal ? pessoa.uid : undefined
  const permite = (modulo: string) => podeModulo(pessoa, modulo, comoFranqueado)
  const checklist = !pessoal && permite('checklist')
  const chamados = permite('chamados')
  const manuais = !pessoal && permite('manuais')
  const universidade = permite('universidade')
  const certificados = !pessoal && universidade
  const estoque = !pessoal && permite('estoque')
  const crm = !pessoal && permite('crm')
  const clientes = !pessoal && permite('cliente')

  const carregar = useCallback(async () => {
    const agora = Date.now()
    const [acompanhamento, inventario, followUps, cobrancas] = await Promise.all([
      unidadeId && (checklist || chamados || manuais || certificados) ? fontePainel(() => carregarAcompanhamento(unidadeId, {
        solicitanteUid,
        fontes: [
          ...(checklist ? ['modelosChecklist', 'execucoes'] as const : []),
          ...(chamados ? ['chamados'] as const : []),
          ...(manuais ? ['progresso'] as const : []),
          ...(certificados ? ['tentativas'] as const : []),
        ],
      })) : null,
      unidadeId && estoque ? fontePainel(() => carregarEstoque(unidadeId)) : null,
      unidadeId && crm ? fontePainel(() => contarFollowUpsAtrasados(unidadeId, agora)) : null,
      unidadeId && clientes ? fontePainel(() => contarCobrancasAtrasadas(unidadeId, agora)) : null,
    ])
    return { acompanhamento, inventario, followUps, cobrancas, agora }
  }, [unidadeId, solicitanteUid, checklist, chamados, manuais, certificados, estoque, crm, clientes])
  const { dados, recarregar } = useDadosPainel(carregar)
  const fontes = dados?.acompanhamento?.fontes
  const rotinas = dados && unidadeId && rotinasDeHoje(fontes?.modelosChecklist ?? null, fontes?.execucoes ?? null,
    dados.acompanhamento?.vigenciasChecklist ?? [], unidadeId, dados.agora)
  const tickets = dados && unidadeId && chamadosDoPainel(fontes?.chamados ?? null, dados.agora, unidadeId, solicitanteUid)
  const treino = unidadeId && treinamentoDaUnidade(unidadeId, manuais ? fontes?.progresso ?? null : null,
    certificados ? fontes?.tentativas ?? null : null)
  const saldo = dados?.inventario && unidadeId && estoqueDoPainel(dados.inventario, [{ id: unidadeId, nome: pessoa.unidade }])
  const detalhesTreino = [
    manuais && (treino && treino.manuais
      ? `${treino.manuais.concluidos} manuais concluídos · ${treino.manuais.emAndamento} em andamento` : 'Manuais indisponíveis'),
    certificados && (treino && treino.certificados !== null ? `${treino.certificados} certificados` : 'Certificados indisponíveis'),
  ].filter(Boolean).join(' · ')
  const followUps = dados?.followUps ?? null
  const cobrancas = dados?.cobrancas ?? null
  const itens: Indicador[] = []
  if (checklist) itens.push({
    titulo: 'Checklist de hoje', valor: rotinas ? rotinas.pendentes + rotinas.atrasadas : null,
    detalhe: rotinas ? `${rotinas.pendentes} pendentes · ${rotinas.atrasadas} em atraso · ${rotinas.concluidas} concluídas hoje` : '',
    icone: ClipboardCheck, para: '/checklist',
  })
  if (chamados) itens.push({
    titulo: pessoal ? 'Meus chamados abertos' : 'Chamados abertos', valor: tickets ? tickets.abertos : null,
    detalhe: tickets ? `${tickets.aguardando} aguardando a unidade` : '', icone: Headset, para: '/chamados',
  })
  if (manuais || certificados) itens.push({
    titulo: 'Pessoas com progresso', valor: treino ? treino.pessoas : null, detalhe: detalhesTreino,
    parcial: Boolean((manuais && (!treino || !treino.manuais)) || (certificados && (!treino || treino.certificados === null))),
    icone: GraduationCap, para: manuais ? '/manuais' : '/universidade',
  })
  if (estoque) itens.push({
    titulo: 'Itens de estoque em alerta', valor: saldo ? saldo.baixos + saldo.zerados : null,
    detalhe: saldo ? `${saldo.zerados} sem saldo · ${saldo.baixos} abaixo do mínimo · ${saldo.abertas} contagens abertas` : '',
    icone: Boxes, para: '/estoque',
  })
  if (crm) itens.push({ titulo: 'Retornos do CRM em atraso', valor: followUps, detalhe: 'Contatos para retomar', icone: UsersRound, para: '/crm' })
  if (clientes) itens.push({ titulo: 'Cobranças em atraso', valor: cobrancas, detalhe: 'Cobranças de clientes ativos', icone: UsersRound, para: '/clientes' })

  return (
    <>
      {!unidadeId ? <Aviso>Esta conta está sem unidade vinculada. Confirme o vínculo com a franqueadora.</Aviso> : null}
      <Indicadores rotulo={pessoal ? 'Indicadores pessoais' : 'Indicadores da unidade'} itens={itens} carregando={!dados} recarregar={recarregar} />
      <AcoesRapidas />
      {!comoFranqueado ? <PendenciasInicio pessoal={pessoal} /> : null}
      {!comoFranqueado && !pessoal ? <CompromissosUnidade pessoa={pessoa} /> : null}
      {!pessoal ? <PedidosUnidade /> : null}
      {!comoFranqueado && universidade ? <div className="mt-6 max-w-2xl"><CartaoUniversidade /></div> : null}
    </>
  )
}
