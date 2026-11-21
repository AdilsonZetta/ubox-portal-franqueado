import { Link, Navigate } from 'react-router-dom'
import { ClipboardCheck, History, ShieldAlert } from 'lucide-react'
import { Aviso, Button, Carregando, Selo, Vazio, cx } from '../../components/ui'
import { formatarData } from '../../lib/format'
import {
  ROTULO_FREQ,
  ROTULO_PERIODO,
  ROTULO_TIPO_CK,
  inicioPeriodo,
  mediaScore,
  naoConformidades,
  situacaoModelo,
  type Situacao,
} from '../../lib/checklist'
import { useVisao } from '../../lib/visao'
import { ListaExecucoes, ScoreSelo, SituacaoSelo } from './partes'
import { useChecklist } from './useChecklist'

const DIA = 86_400_000
const ORDEM: Record<Situacao, number> = { atrasado: 0, pendente: 1, avulso: 2, em_dia: 3 }

export function ChecklistPage() {
  const { comoFranqueado, simulado } = useVisao()
  const agora = Date.now()
  // Início do dia (estável entre renderizações) menos ~2 meses: cobre o período anterior do mensal.
  const dados = useChecklist({ deMs: inicioPeriodo('diaria', agora) - 62 * DIA })

  if (dados.gestor) return <Navigate to="/checklist/gestao" replace />
  if (comoFranqueado && !simulado) return <Aviso>Escolha qual franqueado simular para ver o checklist dessa unidade.</Aviso>
  if (!dados.carregando && !dados.participa) return <Aviso>O Checklist Operacional é preenchido pelas unidades.</Aviso>

  const cartoes = dados.modelos
    .filter((m) => m.ativo)
    .map((m) => ({ modelo: m, ...situacaoModelo(m, dados.execucoes, agora) }))
    .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.modelo.titulo.localeCompare(b.modelo.titulo, 'pt-BR'))
  const atrasados = cartoes.filter((c) => c.situacao === 'atrasado').length
  const pendentes = cartoes.filter((c) => c.situacao === 'pendente').length
  const ultimos30 = dados.execucoes.filter((e) => e.criadoEmMs >= agora - 30 * DIA)
  const ncs30 = naoConformidades(ultimos30).length
  const media = mediaScore(ultimos30)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="cabecalho-pagina flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Checklist Operacional</p>
          <h1 className="text-3xl font-bold">Rotinas da unidade</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Abertura, fechamento, limpeza e vistorias definidos pela franqueadora. Preencha no período, registre evidências e acompanhe o score.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/checklist/historico" className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold hover:border-ink/30">
            <History className="h-4 w-4" aria-hidden="true" /> Histórico
          </Link>
          <Link to="/checklist/nao-conformidades" className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold hover:border-ink/30">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Não conformidades
          </Link>
        </div>
      </header>

      {dados.erro ? <Aviso tom="erro"><p role="alert">{dados.erro}</p><Button type="button" variant="secondary" className="mt-2" onClick={dados.recarregar}>Tentar novamente</Button></Aviso> : null}
      {dados.simulando ? <Aviso>Simulação: você vê o checklist como {simulado?.nome}. O preenchimento fica com a unidade.</Aviso> : null}
      {dados.carregando ? <Carregando texto="Carregando checklists…" /> : null}

      {!dados.carregando && !dados.erro ? (
        <>
          <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Resumo titulo="Atrasados" valor={atrasados} destaque={atrasados > 0} texto="Período anterior sem checklist" />
            <Resumo titulo="Pendentes" valor={pendentes} texto="Ainda falta no período atual" />
            <Resumo titulo="Não conformidades" valor={ncs30} texto="Itens Não OK nos últimos 30 dias" destaque={ncs30 > 0} />
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Score médio (30 dias)</p>
              <div className="mt-2">{media === null ? <span className="text-2xl font-bold text-ink/30">—</span> : <ScoreSelo score={media} grande />}</div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Checklists da unidade</h2>
            {!cartoes.length ? <Vazio titulo="Nenhum checklist liberado" texto="A franqueadora ainda não publicou checklists para a sua unidade." /> : null}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cartoes.map(({ modelo, situacao, ultimaMs }) => (
                <li key={modelo.id} className={cx('flex flex-col rounded-2xl border bg-surface p-4 shadow-sm', situacao === 'atrasado' ? 'border-red-300' : 'border-line')}>
                  <div className="flex flex-wrap gap-1.5">
                    <SituacaoSelo situacao={situacao} />
                    <Selo tom="marca">{ROTULO_TIPO_CK[modelo.tipo]}</Selo>
                    <Selo>{ROTULO_FREQ[modelo.frequencia]}</Selo>
                  </div>
                  <h3 className="mt-2 font-bold">{modelo.titulo}</h3>
                  {modelo.descricao ? <p className="mt-0.5 line-clamp-2 text-sm text-muted">{modelo.descricao}</p> : null}
                  <p className="mt-1 text-xs text-muted">
                    {modelo.totalItens} itens · {ultimaMs ? `último em ${formatarData(ultimaMs)}` : 'nunca preenchido'}
                    {modelo.frequencia !== 'avulsa' && situacao === 'em_dia' ? ` · feito ${ROTULO_PERIODO[modelo.frequencia]}` : ''}
                  </p>
                  <div className="mt-auto pt-3">
                    {dados.simulando ? null : (
                      <Link
                        to={`/checklist/preencher/${modelo.id}`}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
                      >
                        <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> {situacao === 'em_dia' ? 'Preencher de novo' : 'Preencher agora'}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between">
              <h2 className="text-lg font-bold">Últimos checklists</h2>
              <Link to="/checklist/historico" className="text-sm font-semibold text-brand-dark hover:underline">Ver tudo</Link>
            </div>
            <ListaExecucoes execucoes={dados.execucoes.slice(0, 8)} />
          </section>
        </>
      ) : null}
    </div>
  )
}

function Resumo({ titulo, valor, texto, destaque = false }: { titulo: string; valor: number; texto: string; destaque?: boolean }) {
  return (
    <div className={destaque ? 'rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm' : 'rounded-2xl border border-line bg-surface p-4 shadow-sm'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      <p className={destaque ? 'mt-1 text-3xl font-bold text-red-700' : 'mt-1 text-3xl font-bold'}>{valor}</p>
      <p className="text-xs text-muted">{texto}</p>
    </div>
  )
}
