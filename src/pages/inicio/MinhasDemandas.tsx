import { useCallback, useId } from 'react'
import { ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LinkBotao, Selo } from '../../components/ui'
import { hojeLocal, resumoDemandas, STATUS_DEMANDA, type Demanda } from '../../lib/demandas'
import { listarDemandas } from '../../lib/demandasSupabase'
import { acaoDemandaClass, EstadoConsulta, MetadadosDemanda, type ConsultaDemandas, useConsultaDemandas } from '../demandas/partes'
import { linkPainel } from './indicadores'

export function MinhasDemandas({ uid, admin }: { uid: string; admin: boolean }) {
  const consultar = useCallback(() => listarDemandas(uid), [uid])
  const consulta = useConsultaDemandas(consultar)
  return <CartaoDemandas titulo="Minhas demandas" consulta={consulta} uid={uid}
    destino={admin ? '/demandas?escopo=todas' : '/demandas'} nova
    vazio="Você não tem demandas abertas atribuídas. Consulte o quadro para ver as demandas da sua área." />
}

export function CartaoDemandas({ titulo, consulta, destino, uid, nova, vazio }: {
  titulo: string; consulta: ConsultaDemandas<Demanda[]>; destino: string; uid?: string; nova?: boolean; vazio: string
}) {
  const tituloId = useId()
  const hoje = hojeLocal()
  const resumo = consulta.dados ? resumoDemandas(consulta.dados, uid, hoje) : null

  return (
    <section aria-labelledby={tituloId} className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="icone-modulo grid size-10 place-items-center rounded-[10px]">
            <ClipboardList className="size-5" aria-hidden="true" />
          </span>
          <h3 id={tituloId} className="font-bold">{titulo}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link className={linkPainel} to={destino}>Ver todas</Link>
          {nova ? <LinkBotao className={acaoDemandaClass} to="/demandas?novo=1">Nova demanda</LinkBotao> : null}
        </div>
      </div>
      {consulta.erro || !resumo ? <EstadoConsulta {...consulta} texto="Carregando suas demandas…" falha="Não foi possível carregar suas demandas." /> : (
        <>
          <dl className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-paper p-3 sm:p-4">
            {([['Abertas', resumo.abertas], ['Atrasadas', resumo.atrasadas], ['Para hoje', resumo.paraHoje]] as const).map(([rotulo, valor]) => (
              <div key={rotulo} className="min-w-0">
                <dt className="text-xs font-medium text-muted sm:text-sm">{rotulo}</dt>
                <dd className={`text-xl font-extrabold tabular-nums ${rotulo === 'Atrasadas' && valor ? 'text-red-700' : ''}`}>{valor}</dd>
              </div>
            ))}
          </dl>
          {resumo.proximas.length ? (
            <ul className="divide-y divide-line">
              {resumo.proximas.map((demanda) => (
                <li key={demanda.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link className={`${linkPainel} wrap-anywhere`} to={`/demandas?id=${demanda.id}`}>{demanda.titulo}</Link>
                    <div className="mt-1"><MetadadosDemanda demanda={demanda} hoje={hoje} /></div>
                  </div>
                  <Selo>{STATUS_DEMANDA[demanda.status]}</Selo>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{vazio}</p>}
        </>
      )}
    </section>
  )
}
