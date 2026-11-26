import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Button, Carregando, Vazio } from '../../components/ui'
import { ROTULO_FONTE, estadoDasFontes, fontesIndisponiveis } from '../../lib/acompanhamento'
import { podeGerirAuditoria } from '../../lib/auditoria'
import { useAuth } from '../../lib/auth'
import { podeGerirChecklist } from '../../lib/checklist'
import { podeModulo } from '../../lib/modulosAcesso'
import { carregarAcompanhamento, type DadosAcompanhamento } from '../../lib/acompanhamentoApi'
import { formatarDia } from '../../lib/format'
import { listarUnidades } from '../../lib/gestao'
import { compararLinhasRede, linhasRede, pendenciaPrincipal } from '../../lib/inicioRede'
import type { Unidade } from '../../types'
import { SaudeSelo, useAcessoAcompanhamento } from '../acompanhamento/partes'

export function AtencaoRede() {
  const { user } = useAuth()
  const { gestor } = useAcessoAcompanhamento()
  return gestor && user ? <AlertasRede key={user.uid} /> : null
}

function AlertasRede() {
  const { user } = useAuth()
  const { ehAdmin } = useAcessoAcompanhamento()
  const permiteChamados = podeModulo(user, 'chamados', false)
  const permiteAuditoria = podeGerirAuditoria(user, ehAdmin)
  const permiteChecklist = podeGerirChecklist(user, ehAdmin)
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<{ unidades: Unidade[]; dados: DadosAcompanhamento; agora: number } | 'erro' | null>(null)

  useEffect(() => {
    let ativo = true
    void Promise.all([listarUnidades(), carregarAcompanhamento()])
      .then(([unidades, dados]) => { if (ativo) setResultado({ unidades, dados, agora: Date.now() }) })
      .catch(() => { if (ativo) setResultado('erro') })
    return () => { ativo = false }
  }, [tentativa])

  const retry = <Button variant="ghost" onClick={() => { setResultado(null); setTentativa((t) => t + 1) }}>Tentar novamente</Button>
  const dados = resultado && resultado !== 'erro' ? resultado.dados : null
  const indisponiveis = dados ? fontesIndisponiveis(estadoDasFontes(dados.fontes)).map((f) => ROTULO_FONTE[f]) : []
  const linhas = resultado && resultado !== 'erro'
    ? linhasRede(resultado.unidades, resultado.dados, resultado.agora).filter((l) => l.saude !== 'verde').sort(compararLinhasRede).slice(0, 6)
    : []

  return (
    <section className="mt-6 space-y-3" aria-labelledby="atencao-rede-titulo">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="atencao-rede-titulo" className="text-lg font-bold">Unidades que pedem atenção</h2>
        <Link className="text-sm font-semibold text-brand-dark hover:underline" to="/acompanhamento">Ver todas na Visão da rede</Link>
      </div>
      {!resultado ? <Carregando texto="Reunindo os dados da rede…" /> : null}
      {resultado === 'erro' ? <Aviso tom="erro"><span role="alert">Não foi possível carregar os dados da rede.</span> {retry}</Aviso> : null}
      {indisponiveis.length ? <Aviso><span role="status">Fontes indisponíveis: {indisponiveis.join(', ')}.</span> {retry}</Aviso> : null}
      {resultado && resultado !== 'erro' && !linhas.length ? (
        <Vazio titulo="Nenhuma unidade pede atenção agora" texto="Consulte a Visão da rede para ver a situação de todas as unidades." />
      ) : null}
      {resultado && resultado !== 'erro' && linhas.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {linhas.map((linha) => {
            const { u, saude, motivo, destino } = linha
            const pendencia = pendenciaPrincipal(linha, resultado.dados, resultado.agora)
            const rota = pendencia?.destino
            const podeAbrir = rota && (
              rota.startsWith('/acompanhamento/')
              || (rota.startsWith('/auditoria') && permiteAuditoria)
              || (rota.startsWith('/chamados') && permiteChamados)
              || (rota.startsWith('/checklist') && permiteChecklist)
            )
            return (
              <li key={u.id} className="min-w-0 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="break-words font-bold"><Link to={destino} className="hover:underline">{u.nome}</Link></h3>
                  <SaudeSelo nivel={saude} />
                </div>
                {motivo.riscosConfirmados.length ? (
                  <ul className="space-y-1 text-sm text-ink-soft">
                    {motivo.riscosConfirmados.map((s) => <li key={s.chave}><strong>{s.rotulo}</strong> · {s.detalhe}</li>)}
                  </ul>
                ) : null}
                {saude === 'insuficiente' && motivo.sinaisIndisponiveis.length ? (
                  <p className="text-sm text-ink-soft"><strong>Dados indisponíveis</strong> · {motivo.sinaisIndisponiveis.join(', ')}.
                    {motivo.fontesIndisponiveis.length ? ` Fontes: ${motivo.fontesIndisponiveis.join(', ')}.` : ''}</p>
                ) : null}
                {pendencia ? (
                  <div className="space-y-1 border-t border-line pt-3 text-sm">
                    <p className="text-xs font-semibold text-muted">Pendência principal</p>
                    <p className="break-words font-semibold">{pendencia.titulo}</p>
                    {pendencia.responsavel ? <p className="text-ink-soft">Responsável {pendencia.responsavel}</p> : null}
                    {pendencia.prazoMs ? <p className="text-ink-soft">Prazo {formatarDia(pendencia.prazoMs, 'short')}</p> : null}
                    <Link className="inline-block font-semibold text-brand-dark hover:underline" to={podeAbrir ? rota : destino} aria-label={`${podeAbrir ? 'Abrir pendência' : 'Ver painel'} de ${u.nome}`}>{podeAbrir ? 'Abrir pendência' : 'Ver painel da unidade'}</Link>
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
