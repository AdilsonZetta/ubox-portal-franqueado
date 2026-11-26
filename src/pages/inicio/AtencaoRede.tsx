import { Link } from 'react-router-dom'
import { Aviso, Button, Carregando, Vazio } from '../../components/ui'
import { ROTULO_FONTE, estadoDasFontes, fontesIndisponiveis, type Fontes } from '../../lib/acompanhamento'
import type { DadosAcompanhamento } from '../../lib/acompanhamentoApi'
import { formatarDia } from '../../lib/format'
import { pendenciaPrincipal, type linhasRede } from '../../lib/inicioRede'
import { SaudeSelo } from '../acompanhamento/partes'

export function AtencaoRede({ linhas, dados, agora, fontes, carregando, recarregar }: {
  linhas: ReturnType<typeof linhasRede>
  dados: DadosAcompanhamento | null
  agora: number
  fontes: (keyof Fontes)[]
  carregando: boolean
  recarregar: () => void
}) {
  if (!carregando && (!dados || !linhas.length)) return null
  const alertas = linhas.filter((l) => l.saude !== 'verde').slice(0, 6)
  const indisponiveis = dados ? fontesIndisponiveis(estadoDasFontes(dados.fontes)).filter((f) => fontes.includes(f)).map((f) => ROTULO_FONTE[f]) : []
  const retry = <Button variant="ghost" onClick={recarregar}>Tentar novamente</Button>
  return (
    <section className="mt-6 space-y-3" aria-labelledby="atencao-rede-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="atencao-rede-titulo" className="text-lg font-bold">Unidades que pedem atenção</h3>
        <Link className="text-sm font-semibold text-brand-dark hover:underline" to="/acompanhamento">Ver todas na Visão da rede</Link>
      </div>
      {carregando ? <Carregando texto="Reunindo os dados da rede…" /> : null}
      {indisponiveis.length ? <Aviso><span role="status">Fontes indisponíveis: {indisponiveis.join(', ')}.</span> {retry}</Aviso> : null}
      {dados && !alertas.length ? (
        <Vazio titulo="Nenhuma unidade pede atenção agora" texto="Consulte a Visão da rede para ver a situação de todas as unidades." />
      ) : null}
      {dados && alertas.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {alertas.map((linha) => {
            const { u, saude, motivo, destino } = linha
            const pendencia = pendenciaPrincipal(linha, dados, agora)
            return (
              <li key={u.id} className="min-w-0 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 className="break-words font-bold"><Link to={destino} className="hover:underline">{u.nome}</Link></h4>
                  <SaudeSelo nivel={saude} />
                </div>
                {motivo.riscosConfirmados.length ? (
                  <ul className="space-y-1 text-sm text-ink-soft">
                    {motivo.riscosConfirmados.map((s) => <li key={s.chave}><strong>{s.rotulo}</strong> · {s.detalhe}</li>)}
                  </ul>
                ) : null}
                {saude === 'insuficiente' && motivo.sinaisIndisponiveis.length ? (
                  <p className="text-sm text-ink-soft"><strong>Dados indisponíveis</strong> · {motivo.sinaisIndisponiveis.join(', ')}.
                    {indisponiveis.length ? ` Fontes: ${indisponiveis.join(', ')}.` : ''}</p>
                ) : null}
                {pendencia ? (
                  <div className="space-y-1 border-t border-line pt-3 text-sm">
                    <p className="text-xs font-semibold text-muted">Pendência principal</p>
                    <p className="break-words font-semibold">{pendencia.titulo}</p>
                    {pendencia.responsavel ? <p className="text-ink-soft">Responsável {pendencia.responsavel}</p> : null}
                    {pendencia.prazoMs ? <p className="text-ink-soft">Prazo {formatarDia(pendencia.prazoMs, 'short')}</p> : null}
                    <Link className="inline-block font-semibold text-brand-dark hover:underline" to={pendencia.destino} aria-label={`Abrir pendência de ${u.nome}`}>Abrir pendência</Link>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
