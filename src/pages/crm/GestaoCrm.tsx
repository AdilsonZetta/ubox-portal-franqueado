import { useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Aviso, Button, Campo, Carregando, Vazio, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import { MAX_LISTA_CONFIG, calcularKpis, formatarReais, kpisPorUnidade, normalizarLista } from '../../lib/crm'
import { salvarConfig } from '../../lib/crmApi'
import { Painel } from './Crm'
import { Numero, RodapeModulo11, useCrm } from './partes'

type Aba = 'rede' | 'config'
const ROTULO_ABA: Record<Aba, string> = { rede: 'KPIs da rede', config: 'Origens e motivos' }
const DIA = 86_400_000

export function GestaoCrmPage() {
  const { user } = useAuth()
  const dados = useCrm()
  const [params, setParams] = useSearchParams()
  const aba = (Object.keys(ROTULO_ABA).includes(params.get('aba') ?? '') ? params.get('aba') : 'rede') as Aba
  const [periodo, setPeriodo] = useState(90)
  const [unidade, setUnidade] = useState('')
  const [okConfig, setOkConfig] = useState('')
  const agora = useMemo(() => Date.now(), [dados.leads])
  const desde = periodo ? agora - periodo * DIA : 0
  const porUnidade = kpisPorUnidade(dados.leads, agora, desde)
  const rede = calcularKpis(dados.leads, agora, desde)

  if (!user) return null
  if (!dados.carregando && !dados.gestor) return <Navigate to="/crm" replace />

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">CRM e Gestão Comercial · Franqueadora</p>
          <h1 className="text-2xl font-black text-ink">Desempenho comercial da rede</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-ink/65">Conversão, origem e tempo de fechamento por unidade. A franqueadora não vê nome, telefone nem e-mail dos clientes: só os números do funil.</p>
        </div>
        <div className="flex flex-wrap rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Seções da gestão do CRM">
          {(Object.keys(ROTULO_ABA) as Aba[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={aba === item} onClick={() => setParams({ aba: item })}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', aba === item ? 'bg-ink text-white' : 'text-ink/60 hover:text-ink')}>{ROTULO_ABA[item]}</button>
          ))}
        </div>
      </header>
      {dados.erro ? <Aviso tom="erro">{dados.erro}</Aviso> : null}
      {dados.carregando ? <Carregando texto="Carregando…" /> : null}

      {!dados.carregando && aba === 'rede' ? (
        <section className="space-y-4">
          <div className="w-48">
            <Campo label="Período (leads criados)">
              <select className={inputClass} value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
                <option value={365}>Últimos 12 meses</option>
                <option value={0}>Tudo</option>
              </select>
            </Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo="Leads na rede" valor={String(rede.total)} dica={`${porUnidade.length} unidade(s)`} />
            <Numero rotulo="Conversão da rede" valor={rede.conversao === null ? '—' : `${rede.conversao}%`} dica={`${rede.ganhos} ganho(s) · ${rede.perdidos} perdido(s)`} />
            <Numero rotulo="Tempo até fechar" valor={rede.diasParaFechar === null ? '—' : `${rede.diasParaFechar.toLocaleString('pt-BR')} dias`} />
            <Numero rotulo="Follow-ups atrasados" valor={String(rede.atrasados)} />
          </div>
          {!porUnidade.length ? <Vazio titulo="Nenhum lead na rede" texto="Quando as unidades cadastrarem leads, os números aparecem aqui." /> : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-paper text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Unidade</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Leads</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Abertos</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Ganhos</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Conversão</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Dias p/ fechar</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Atrasados</th>
                    <th className="px-4 py-2.5 font-semibold">Principal origem</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Valor ganho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {porUnidade.map((u) => (
                    <tr key={u.unidadeId} className={cx('cursor-pointer hover:bg-paper/60', unidade === u.unidadeId && 'bg-paper')} onClick={() => setUnidade(unidade === u.unidadeId ? '' : u.unidadeId)}>
                      <td className="px-4 py-2.5 font-medium"><button type="button" className="hover:underline">{u.unidadeNome}</button></td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{u.total}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{u.abertos}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{u.ganhos}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">{u.conversao === null ? '—' : `${u.conversao}%`}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{u.diasParaFechar === null ? '—' : u.diasParaFechar.toLocaleString('pt-BR')}</td>
                      <td className={cx('px-4 py-2.5 text-right tabular-nums', u.atrasados > 0 && 'font-semibold text-red-700')}>{u.atrasados}</td>
                      <td className="px-4 py-2.5 text-ink/70">{u.porOrigem[0]?.origem ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatarReais(u.valorGanhoCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {unidade ? (
            <div className="space-y-2">
              <h2 className="text-lg font-bold">{porUnidade.find((u) => u.unidadeId === unidade)?.unidadeNome}</h2>
              <Painel leads={dados.leads.filter((l) => l.unidadeId === unidade)} agora={agora} />
            </div>
          ) : null}
        </section>
      ) : null}

      {!dados.carregando && aba === 'config' ? <Config dados={dados} ok={okConfig} setOk={setOkConfig} /> : null}
      <RodapeModulo11 />
    </div>
  )
}

// A mensagem de sucesso fica no pai: recarregar() desmonta este formulário enquanto relê a configuração.
function Config({ dados, ok, setOk }: { dados: ReturnType<typeof useCrm>; ok: string; setOk: (texto: string) => void }) {
  const { user } = useAuth()
  const [origens, setOrigens] = useState(dados.config.origens.join('\n'))
  const [motivos, setMotivos] = useState(dados.config.motivosPerda.join('\n'))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function gravar() {
    if (!user) return
    const o = normalizarLista(origens.split('\n'))
    const m = normalizarLista(motivos.split('\n'))
    if (!o.length || !m.length) { setErro('Deixe pelo menos uma origem e um motivo.'); return }
    setSalvando(true)
    setErro('')
    setOk('')
    try {
      await salvarConfig(user, o, m)
      setOk('Configuração da rede salva. Leads antigos mantêm a origem e o motivo que já tinham.')
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="max-w-3xl space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Origens e motivos de perda da rede</h2>
      <p className="text-sm text-ink/60">Uma opção por linha, até {MAX_LISTA_CONFIG} de até 40 caracteres. As unidades escolhem destas listas.{dados.config.atualizadoEmMs ? ` Última alteração por ${dados.config.atualizadoPorNome} em ${formatarData(dados.config.atualizadoEmMs)}.` : ' Ainda no padrão da rede.'}</p>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Origens"><textarea className={inputClass} rows={9} value={origens} onChange={(e) => setOrigens(e.target.value)} /></Campo>
        <Campo label="Motivos de perda"><textarea className={inputClass} rows={9} value={motivos} onChange={(e) => setMotivos(e.target.value)} /></Campo>
      </div>
      <Button type="button" onClick={() => void gravar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar configuração'}</Button>
    </section>
  )
}
