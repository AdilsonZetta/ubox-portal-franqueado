import { useCallback, useMemo } from 'react'
import { Boxes, Building2, ClipboardCheck, GraduationCap, Headset, UserRoundCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { podeGerirAcompanhamento, type Fontes } from '../../lib/acompanhamento'
import { carregarAcompanhamento } from '../../lib/acompanhamentoApi'
import { listarDesignados, listarUnidadesComEstoque } from '../../lib/adesaoApi'
import { listarUsuarios } from '../../lib/api'
import { podeGerirAuditoria } from '../../lib/auditoria'
import { podeGerirChecklist } from '../../lib/checklist'
import { podeAcessarDemandas } from '../../lib/demandas'
import { podeGerirEstoque } from '../../lib/estoque'
import { carregarEstoque } from '../../lib/estoqueApi'
import { listarUnidades } from '../../lib/gestao'
import { compararLinhasRede, linhasRede } from '../../lib/inicioRede'
import { listarTrilhaManuais } from '../../lib/manuaisApi'
import { podeGerirTrilha } from '../../lib/manuaisTrilha'
import { podeGerirMarketing } from '../../lib/marketing'
import { podeModulo } from '../../lib/modulosAcesso'
import { adesaoDoPainel, atividadeRecente, chamadosDoPainel, conformidade30Dias, estoqueDoPainel } from '../../lib/painelInicial'
import { podeGerirUniversidade } from '../../lib/universidade'
import { listarCursos } from '../../lib/universidadeApi'
import { useVisao } from '../../lib/visao'
import type { Usuario } from '../../types'
import { AtencaoRede } from './AtencaoRede'
import { AtividadeRede, ConformidadeRede } from './DetalhesRede'
import { MinhasDemandas } from './MinhasDemandas'
import { PendenciasInicio } from './PendenciasInicio'
import { Indicadores, linkPainel, type Indicador } from './indicadores'
import { fontePainel, useDadosPainel } from './useDadosPainel'

export function PainelRede({ pessoa }: { pessoa: Usuario }) {
  const { ehAdmin, comoFranqueado } = useVisao()
  const acompanhamento = podeGerirAcompanhamento(pessoa, ehAdmin)
  const checklist = podeGerirChecklist(pessoa, ehAdmin)
  const chamados = podeModulo(pessoa, 'chamados', false)
  const auditoria = podeGerirAuditoria(pessoa, ehAdmin)
  const manuais = podeGerirTrilha(pessoa, ehAdmin)
  const universidade = podeGerirUniversidade(pessoa, ehAdmin)
  const estoque = podeGerirEstoque(pessoa, ehAdmin)
  const marketing = podeGerirMarketing(pessoa, ehAdmin)
  const atividade = checklist || chamados || auditoria

  const carregar = useCallback(async () => {
    const fontes: (keyof Fontes)[] = []
    if (checklist) fontes.push('modelosChecklist', 'execucoes')
    if (chamados) fontes.push('chamados')
    if (auditoria) fontes.push('auditorias', 'acoes')
    if (manuais) fontes.push('progresso', 'trilhaManuais')
    if (universidade) fontes.push('tentativas', 'cursosPublicados')
    if (marketing && acompanhamento) fontes.push('pedidos')
    if (acompanhamento) fontes.push('registros', 'passos')
    const [unidades, dados, inventario, usuarios, designadosManuais, trilha, designadosUniversidade, cursos, unidadesEstoque] = await Promise.all([
      acompanhamento || checklist || estoque || chamados || auditoria ? fontePainel(listarUnidades) : null,
      fontes.length ? fontePainel(() => carregarAcompanhamento(undefined, { fontes, incluirChamadosEncerrados: chamados })) : null,
      estoque ? fontePainel(() => carregarEstoque(null)) : null,
      ehAdmin ? fontePainel(listarUsuarios) : null,
      manuais ? fontePainel(() => listarDesignados('manuais', pessoa)) : null,
      manuais ? fontePainel(listarTrilhaManuais) : null,
      universidade ? fontePainel(() => listarDesignados('universidade', pessoa)) : null,
      universidade ? fontePainel(() => listarCursos(false)) : null,
      estoque && !acompanhamento ? fontePainel(listarUnidadesComEstoque) : null,
    ])
    return { unidades, dados, inventario, usuarios, designadosManuais, trilha, designadosUniversidade, cursos, unidadesEstoque, fontes, agora: Date.now() }
  }, [acompanhamento, checklist, chamados, auditoria, manuais, universidade, estoque, marketing, ehAdmin, pessoa])
  const { dados, recarregar } = useDadosPainel(carregar)
  const resumo = useMemo(() => {
    if (!dados) return null
    const ativas = dados.unidades?.filter((u) => u.ativo) ?? []
    const dadosRede = dados.dados
    const fontes = dadosRede?.fontes
    const linhas = dadosRede && dados.unidades ? linhasRede(ativas, dadosRede, dados.agora).sort(compararLinhasRede) : []
    const conformidade = conformidade30Dias(fontes?.execucoes ?? null,
      dados.unidades ? new Set(ativas.filter((u) => u.modulosLiberados.includes('checklist')).map((u) => u.id)) : null, dados.agora)
    const adesaoManuais = adesaoDoPainel(dados.designadosManuais,
      dados.trilha && new Set(dados.trilha.filter((i) => i.ativo).map((i) => i.documentoId)),
      fontes?.progresso?.filter((p) => p.status === 'concluido').map((p) => ({ ...p, conteudoId: p.documentoId })) ?? null)
    const adesaoUniversidade = adesaoDoPainel(dados.designadosUniversidade,
      dados.cursos && new Set(dados.cursos.filter((c) => c.publicado).map((c) => c.id)),
      fontes?.tentativas?.filter((t) => t.aprovado).map((t) => ({ ...t, conteudoId: t.cursoId })) ?? null)
    return {
      ativas, linhas, conformidade, adesaoManuais, adesaoUniversidade,
      atrasadas: dados.unidades && fontes?.modelosChecklist && fontes.execucoes
        ? linhas.reduce((s, l) => s + (l.resumo.checklist.atrasados ?? 0), 0) : null,
      tickets: chamadosDoPainel(fontes?.chamados ?? null, dados.agora),
      saldo: dados.inventario ? estoqueDoPainel(dados.inventario,
        dados.unidades ? ativas.filter((u) => u.modulosLiberados.includes('estoque')) : dados.unidadesEstoque ?? undefined) : null,
      eventos: fontes ? atividadeRecente(fontes, dados.agora) : [],
      nomes: new Map(dados.unidades?.map((u) => [u.id, u.nome])),
    }
  }, [dados])

  const fontes = dados?.dados?.fontes
  const linhas = resumo?.linhas ?? []
  const atencao = dados?.dados && dados.unidades
    ? linhas.filter((l) => l.saude === 'vermelho' || l.saude === 'amarelo').length : null
  const semClassificacao = linhas.filter((l) => l.saude === 'insuficiente').length
  const tickets = resumo?.tickets
  const saldo = resumo?.saldo
  const adesoes = [
    { liberada: manuais, nome: 'Manuais', total: resumo?.adesaoManuais },
    { liberada: universidade, nome: 'Universidade', total: resumo?.adesaoUniversidade },
  ].filter((a) => a.liberada)
  const treino = adesoes.some((a) => a.total)
    ? adesoes.reduce((s, a) => ({ concluidos: s.concluidos + (a.total?.concluidos ?? 0), designados: s.designados + (a.total?.designados ?? 0) }), { concluidos: 0, designados: 0 }) : null
  const rotinas = resumo?.atrasadas ?? null
  const itens: Indicador[] = []
  if (acompanhamento) itens.push({
    titulo: 'Unidades ativas', valor: dados?.unidades ? resumo?.ativas.length ?? 0 : null,
    detalhe: atencao === null ? 'Atenção na rede indisponível' : `${atencao} ${atencao === 1 ? 'pede' : 'pedem'} atenção${semClassificacao ? ` · ${semClassificacao} com dados insuficientes` : ''}`,
    parcial: atencao === null, icone: Building2, para: '/acompanhamento',
  })
  if (chamados) itens.push({
    titulo: 'Chamados abertos', valor: tickets?.abertos ?? null, detalhe: tickets ? `${tickets.vencidos} com prazo vencido` : '',
    icone: Headset, para: '/chamados',
  })
  if (checklist) itens.push({
    titulo: 'Conformidade em 30 dias',
    valor: fontes?.execucoes ? resumo?.conformidade == null ? '—' : `${resumo.conformidade}%` : null,
    detalhe: [resumo?.conformidade == null && 'Sem execuções no período', rotinas === null ? 'Atrasos indisponíveis' : `${rotinas} ${rotinas === 1 ? 'rotina' : 'rotinas'} em atraso`].filter(Boolean).join(' · '),
    parcial: rotinas === null, icone: ClipboardCheck, para: '/checklist/gestao',
  })
  if (adesoes.length) itens.push({
    titulo: 'Adesão ao treinamento',
    valor: treino ? `${treino.concluidos}/${treino.designados}` : null,
    detalhe: adesoes.map((a) => a.total ? `${a.nome} ${a.total.concluidos} de ${a.total.designados}` : `${a.nome} indisponíveis`).join(' · '),
    parcial: adesoes.some((a) => !a.total), icone: GraduationCap, para: manuais ? '/manuais/gestao' : '/universidade/gestao',
  })
  if (estoque) itens.push({
    titulo: 'Unidades com estoque em alerta', valor: saldo?.unidades ?? null,
    detalhe: saldo ? `${saldo.zerados} sem saldo · ${saldo.baixos} abaixo do mínimo · ${saldo.abertas} ${saldo.abertas === 1 ? 'contagem aberta' : 'contagens abertas'}` : '',
    icone: Boxes, para: '/estoque/gestao',
  })
  if (ehAdmin) itens.push({
    titulo: 'Cadastros aguardando aprovação', valor: dados?.usuarios?.filter((p) => !p.ativo && !p.recusado).length ?? null,
    detalhe: 'Solicitações para revisar', icone: UserRoundCheck, para: '/admin/usuarios',
  })

  const atalhos = [
    acompanhamento && { para: '/acompanhamento', titulo: 'Visão da rede' },
    ehAdmin && { para: '/franqueadora', titulo: 'Unidades e franqueadora' },
    ehAdmin && { para: '/admin/usuarios', titulo: 'Usuários e aprovações' },
    checklist && { para: '/checklist/gestao', titulo: 'Gestão de checklists' },
    chamados && { para: '/chamados', titulo: 'Chamados' },
    manuais && { para: '/manuais/gestao', titulo: 'Gestão de manuais' },
    universidade && { para: '/universidade/gestao', titulo: 'Gestão da Universidade' },
    estoque && { para: '/estoque/gestao', titulo: 'Gestão de estoque' },
    marketing && { para: '/marketing/gestao', titulo: 'Gestão de marketing' },
  ]
  return (
    <>
      <Indicadores rotulo="Indicadores da rede" itens={itens} carregando={!dados} recarregar={recarregar} />
      {podeAcessarDemandas(pessoa, comoFranqueado) ? <MinhasDemandas uid={pessoa.uid} admin={ehAdmin} /> : null}
      {acompanhamento ? (
        <>
          <ConformidadeRede linhas={linhas} checklist={checklist} chamados={chamados} manuais={manuais}
            carregando={!dados} indisponivel={!dados?.unidades || !dados.dados} />
          <AtencaoRede linhas={linhas} dados={dados?.dados ?? null} agora={dados?.agora ?? 0} fontes={dados?.fontes ?? []} carregando={!dados} recarregar={recarregar} />
        </>
      ) : null}
      {atividade ? <AtividadeRede eventos={resumo?.eventos ?? []} unidades={resumo?.nomes ?? new Map()}
        carregando={!dados} recarregar={recarregar} indisponivel={Boolean(dados && ((checklist && !fontes?.execucoes) || (chamados && !fontes?.chamados) || (auditoria && !fontes?.auditorias)))} /> : null}
      <PendenciasInicio />
      {atalhos.some(Boolean) ? (
        <nav aria-labelledby="atalhos-gestao-titulo" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h3 id="atalhos-gestao-titulo" className="font-bold">Atalhos de gestão</h3>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-sm">
            {atalhos.map((atalho) => atalho ? <li key={atalho.para}><Link className={linkPainel} to={atalho.para}>{atalho.titulo}</Link></li> : null)}
          </ul>
        </nav>
      ) : null}
    </>
  )
}
