import { Link } from 'react-router-dom'
import { Aviso, Button, Carregando, Vazio } from '../../components/ui'
import type { linhasRede } from '../../lib/inicioRede'
import { formatarDia } from '../../lib/format'
import type { atividadeRecente } from '../../lib/painelInicial'
import { SaudeSelo } from '../acompanhamento/partes'
import { linkPainel } from './indicadores'

type LinhaRede = ReturnType<typeof linhasRede>[number]

export function ConformidadeRede({ linhas, checklist, chamados, manuais, carregando, indisponivel }: {
  linhas: LinhaRede[]
  checklist: boolean
  chamados: boolean
  manuais: boolean
  carregando: boolean
  indisponivel: boolean
}) {
  const colunas = [
    { titulo: 'Unidade', mostrar: true },
    { titulo: 'Saúde', mostrar: true },
    { titulo: 'Conformidade (30 dias)', mostrar: checklist },
    { titulo: 'Rotinas em atraso', mostrar: checklist },
    { titulo: 'Chamados abertos', mostrar: chamados },
    { titulo: 'Manuais concluídos', mostrar: manuais },
  ].filter((c) => c.mostrar)
  return (
    <section className="space-y-3" aria-labelledby="conformidade-inicio-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold" id="conformidade-inicio-titulo">Conformidade por unidade</h3>
        <Link className={linkPainel} to="/acompanhamento">Abrir visão da rede</Link>
      </div>
      {carregando ? <Carregando texto="Consultando unidades…" />
        : indisponivel ? <Aviso>Dados das unidades indisponíveis. Consulte a Visão da rede ou tente carregar os indicadores novamente.</Aviso>
          : !linhas.length ? <Vazio titulo="Nenhuma unidade ativa" texto="Consulte o cadastro na Visão da rede." />
            : (
              <div className="overflow-x-auto rounded-2xl border border-line bg-surface focus-visible:outline-2 focus-visible:outline-brand-dark"
                tabIndex={0} role="region" aria-labelledby="conformidade-inicio-titulo">
                <table className="w-full text-left text-sm">
                  <thead className="bg-paper text-ink-soft">
                    <tr>{colunas.map(({ titulo }, i) => <th key={titulo} scope="col" className={`px-4 py-3 ${i > 1 ? 'text-right' : ''}`}>{titulo}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line tabular-nums">
                    {linhas.map(({ u, saude, destino, resumo }) => (
                      <tr key={u.id} className="hover:bg-paper/60">
                        <th scope="row" className="min-w-36 break-words px-4 py-3"><Link className={linkPainel} to={destino}>{u.nome}</Link></th>
                        <td className="px-4 py-3"><SaudeSelo nivel={saude} /></td>
                        {checklist ? <td className="px-4 py-3 text-right">{resumo.checklist.media == null ? '—' : `${resumo.checklist.media}%`}</td> : null}
                        {checklist ? <td className="px-4 py-3 text-right">{resumo.checklist.atrasados ?? '—'}</td> : null}
                        {chamados ? <td className="px-4 py-3 text-right">{resumo.chamados?.abertos ?? '—'}</td> : null}
                        {manuais ? <td className="px-4 py-3 text-right">{resumo.manuais?.percentual == null ? '—' : `${resumo.manuais.percentual}%`}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
    </section>
  )
}

export function AtividadeRede({ eventos, unidades, carregando, indisponivel, recarregar }: {
  eventos: ReturnType<typeof atividadeRecente>
  unidades: ReadonlyMap<string, string>
  carregando: boolean
  indisponivel: boolean
  recarregar: () => void
}) {
  return (
    <section className="space-y-3" aria-labelledby="atividade-inicio-titulo">
      <h3 className="text-lg font-bold" id="atividade-inicio-titulo">Atividade recente</h3>
      {carregando ? <Carregando texto="Consultando atividades…" /> : null}
      {indisponivel ? <Aviso>Parte da atividade está indisponível. <Button variant="ghost" onClick={recarregar}>Tentar novamente</Button></Aviso> : null}
      {!carregando && !indisponivel && !eventos.length ? <Vazio titulo="Nenhuma atividade recente" texto="Abra os módulos para consultar o histórico da rede." /> : null}
      {eventos.length ? (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {eventos.map((e) => (
            <li key={JSON.stringify([e.para, e.data, e.unidadeId, e.titulo])} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 break-words">
                <Link className={linkPainel} to={e.para}>{e.titulo ? `${e.tipo} · ${e.titulo}` : e.tipo}</Link>
                <p className="text-sm text-muted">{unidades.get(e.unidadeId) || e.unidadeNome || 'Unidade sem nome'}</p>
              </div>
              <time dateTime={new Date(e.data).toISOString()} className="text-sm tabular-nums text-muted">{formatarDia(e.data, 'short')}</time>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
