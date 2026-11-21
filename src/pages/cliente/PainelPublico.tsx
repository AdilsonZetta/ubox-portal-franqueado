import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { Aviso, Button, Carregando } from '../../components/ui'
import { formatarData } from '../../lib/format'
import { ITENS_VAZIOS, RECADOS_NO_LINK, ROTULO_VISITA, formatarCompetencia, formatarDiaISO, formatarReais, hojeISO, resumoCobrancas, situacao, type ItensPainel, type Painel } from '../../lib/cliente'
import { BACKEND } from '../../lib/backend'
import { carregarPainelPublicoSb } from '../../lib/clienteSupabase'
import { carregarItens, lerPainelPublico } from '../../lib/clienteApi'
import { SituacaoSelo, diaDe } from './partes'

async function carregarPainelFirebase(token: string) {
  // Só consulta os itens de um painel ativo.
  const painel = await lerPainelPublico(token)
  const itens = painel?.ativo ? await carregarItens(token, { somenteServidor: true }) : ITENS_VAZIOS
  return { painel, itens }
}

/** Página pública do locatário: abre por link secreto, sem login. Só lê o painel do token. */
export function PainelClientePage() {
  const { token = '' } = useParams()
  return <PainelPorToken key={token} token={token} />
}

function PainelPorToken({ token }: { token: string }) {
  const [leitura, setLeitura] = useState<
    { status: 'carregando' } | { status: 'erro' } | { status: 'lido'; dados: { painel: Painel | null; itens: ItensPainel } | null }
  >({ status: 'carregando' })
  const [tentativa, setTentativa] = useState(0)
  const hoje = useMemo(() => hojeISO(), [])

  useEffect(() => {
    let ativo = true
    const pedido = BACKEND === 'supabase' ? carregarPainelPublicoSb(token) : carregarPainelFirebase(token)
    void pedido
      .then((dados) => { if (ativo) setLeitura({ status: 'lido', dados }) })
      .catch(() => { if (ativo) setLeitura({ status: 'erro' }) })
    return () => { ativo = false }
  }, [token, tentativa])

  if (leitura.status === 'carregando') return <div className="grid min-h-screen place-items-center"><Carregando texto="Abrindo seu painel…" /></div>
  if (leitura.status === 'erro') return (
    <main className="grid min-h-screen place-items-center bg-paper p-6">
      <div className="max-w-md space-y-4 rounded-3xl border border-line bg-white p-6 shadow-sm">
        <Logo compacto />
        <Aviso tom="erro">Não foi possível abrir seu painel.</Aviso>
        <Button type="button" onClick={() => {
          setLeitura({ status: 'carregando' })
          setTentativa((n) => n + 1)
        }}>Tentar novamente</Button>
      </div>
    </main>
  )
  const painel = leitura.dados?.painel
  const itens = leitura.dados?.itens ?? ITENS_VAZIOS
  if (!painel || !painel.ativo) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper p-6">
        <div className="max-w-md space-y-4 rounded-3xl border border-line bg-white p-6 text-center shadow-sm">
          <div className="flex justify-center"><Logo compacto /></div>
          <h1 className="text-xl font-black">Link indisponível</h1>
          <p className="text-sm text-ink/65">Este endereço não existe ou foi desativado pela unidade. Peça um link novo para a sua unidade Ubox.</p>
        </div>
      </div>
    )
  }

  const r = resumoCobrancas(itens.cobrancas, hoje)
  const proximasVisitas = itens.visitas.filter((v) => v.status === 'agendada' && v.data >= hoje).sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2"><Logo compacto /><span className="leading-tight"><span className="block text-[15px] font-extrabold tracking-[0.14em]">UBOX</span><span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-ink/55">Painel do cliente</span></span></span>
          <span className="text-xs text-ink/55">{painel.unidadeNome}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <section>
          <h1 className="text-2xl font-black">Olá, {painel.primeiroNome}!</h1>
          <p className="text-sm text-ink/65">Aqui você acompanha o seu box, as mensalidades, as visitas e os recados da unidade.</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Seu box</p><p className="mt-1 text-xl font-black">{painel.box}</p><p className="text-xs text-ink/50">desde {formatarDiaISO(diaDe(painel.contratoInicioMs))}{painel.contratoFimMs ? ` até ${formatarDiaISO(diaDe(painel.contratoFimMs))}` : ''}</p></div>
          <div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Mensalidade</p><p className="mt-1 text-xl font-black tabular-nums">{formatarReais(painel.valorMensalCentavos)}</p><p className="text-xs text-ink/50">vence todo dia {painel.diaVencimento}</p></div>
          <div className={`rounded-2xl border bg-white p-4 shadow-sm ${r.atrasadas ? 'border-red-300' : 'border-line'}`}><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">{r.atrasadas ? 'Em atraso' : 'Próxima cobrança'}</p>
            {r.atrasadas ? <p className="mt-1 text-xl font-black text-red-700 tabular-nums">{formatarReais(r.atrasadoCentavos)}</p> : r.proxima ? <p className="mt-1 text-xl font-black tabular-nums">{formatarReais(r.proxima.valorCentavos)}</p> : <p className="mt-1 text-xl font-black text-lime-700">Em dia</p>}
            <p className="text-xs text-ink/50">{r.atrasadas ? `${r.atrasadas} mensalidade(s) vencida(s)` : r.proxima ? `vence ${formatarDiaISO(r.proxima.vencimento)}` : 'nenhuma cobrança em aberto'}</p></div>
        </section>

        {itens.recados.length ? (
          <section className="space-y-2 rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Recados da unidade</h2>
            {itens.recados.slice(0, RECADOS_NO_LINK).map((x) => (
              <article key={x.id} className="rounded-xl bg-paper px-3 py-2 text-sm">
                <p className="text-[11px] text-ink/45">{formatarData(x.criadoEmMs)} · {x.autor || 'Equipe Ubox'}{x.geradoPorIA ? ` · texto com ajuda de IA (${x.iaModelo})` : ''}</p>
                <p className="whitespace-pre-wrap">{x.texto}</p>
              </article>
            ))}
          </section>
        ) : null}

        <section className="space-y-2 rounded-3xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Mensalidades</h2>
          {itens.cobrancas.length === 0 ? <p className="text-sm text-ink/50">Nenhuma cobrança lançada ainda.</p> : (
            <ul className="divide-y divide-line">
              {itens.cobrancas.slice(0, 24).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div><p className="font-semibold">{formatarCompetencia(c.competencia)}</p><p className="text-xs text-ink/55">vence {formatarDiaISO(c.vencimento)}{c.pagoEm ? ` · paga em ${formatarDiaISO(c.pagoEm)}` : ''}</p></div>
                  <div className="flex items-center gap-2"><span className="tabular-nums">{formatarReais(c.valorCentavos)}</span><SituacaoSelo s={situacao(c, hoje)} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2 rounded-3xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Visitas</h2>
          {itens.visitas.length === 0 ? <p className="text-sm text-ink/50">Nenhuma visita agendada.</p> : (
            <ul className="divide-y divide-line">
              {(proximasVisitas.length ? proximasVisitas : itens.visitas.slice(0, 5)).map((v) => (
                <li key={v.id} className="py-2 text-sm"><p className="font-semibold">{formatarDiaISO(v.data)} às {v.hora} · {ROTULO_VISITA[v.status]}</p>{v.motivo ? <p className="text-xs text-ink/55">{v.motivo}</p> : null}</li>
              ))}
            </ul>
          )}
        </section>

        {painel.contatoUnidade ? <p className="text-center text-sm text-ink/65">Dúvidas? Fale com a {painel.unidadeNome}: <b>{painel.contatoUnidade}</b></p> : null}
        <p className="text-center text-[11px] text-ink/40">{painel.atualizadoEmMs ? `Atualizado em ${formatarData(painel.atualizadoEmMs)}. ` : ''}Não compartilhe este link.</p>
      </main>
    </div>
  )
}
