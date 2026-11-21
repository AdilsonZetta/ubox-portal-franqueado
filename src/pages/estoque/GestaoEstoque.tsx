import { useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { BotaoCsv } from '../../components/BotaoCsv'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import {
  CATEGORIAS,
  ROTULO_CATEGORIA,
  STATUS_PEDIDO,
  ROTULO_STATUS_PEDIDO,
  UNIDADES_MEDIDA,
  formatarPreco,
  resumoRede,
  tabelaSaldos,
  validarItem,
  type ItemEstoque,
  type ItemForm,
  type Pedido,
  type StatusPedido,
} from '../../lib/estoque'
import { aprovarPedido, cancelarPedidoRede, enviarPedido, salvarItem } from '../../lib/estoqueApi'
import { Historico, TabelaSaldo } from './Estoque'
import { StatusPedidoSelo, useEstoque } from './partes'

type Aba = 'catalogo' | 'rede' | 'pedidos' | 'movimentos'
const ROTULO_ABA: Record<Aba, string> = { catalogo: 'Catálogo', rede: 'Estoque da rede', pedidos: 'Pedidos', movimentos: 'Movimentos' }

const formVazio: ItemForm = { nome: '', codigo: '', categoria: 'insumos', unidadeMedida: 'un', estoqueMinimo: 0, preco: '', descricao: '', ativo: true, geradoPorIA: false, iaModelo: '' }

function paraForm(i: ItemEstoque): ItemForm {
  return {
    nome: i.nome, codigo: i.codigo, categoria: i.categoria, unidadeMedida: i.unidadeMedida, estoqueMinimo: i.estoqueMinimo,
    preco: i.precoSugeridoCentavos ? (i.precoSugeridoCentavos / 100).toFixed(2).replace('.', ',') : '',
    descricao: i.descricao, ativo: i.ativo, geradoPorIA: i.geradoPorIA, iaModelo: i.iaModelo,
  }
}

export function GestaoEstoquePage() {
  const { user } = useAuth()
  const dados = useEstoque()
  const [params, setParams] = useSearchParams()
  const aba = (Object.keys(ROTULO_ABA).includes(params.get('aba') ?? '') ? params.get('aba') : 'catalogo') as Aba
  const [editando, setEditando] = useState<ItemEstoque | null>(null)
  const [form, setForm] = useState<ItemForm | null>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [unidadeVista, setUnidadeVista] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<StatusPedido | 'ativos'>('ativos')
  const [categoria, setCategoria] = useState('')

  const resumo = useMemo(() => resumoRede(dados.itens, dados.movimentos, dados.pedidos, dados.contagens), [dados.itens, dados.movimentos, dados.pedidos, dados.contagens])

  if (!user) return null
  if (!dados.carregando && !dados.gestor) return <Navigate to="/estoque" replace />

  async function gravar() {
    if (!user || !form || salvando) return
    const erros = validarItem(form)
    if (erros.length) { setErro(erros.join(' ')); return }
    setSalvando(true)
    setErro('')
    try {
      await salvarItem(user, editando, form)
      setOk(editando ? 'Item atualizado.' : 'Item criado no catálogo da rede.')
      setForm(null)
      setEditando(null)
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  const catalogo = [...dados.itens]
    .filter((i) => !categoria || i.categoria === categoria)
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Controle de Estoque · Franqueadora</p>
          <h1 className="text-2xl font-black text-ink">Gestão do estoque</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-ink/65">Catálogo padrão da rede, estoque de cada unidade com alertas de mínimo e os pedidos de reposição.</p>
        </div>
        <div className="flex flex-wrap rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Seções da gestão do estoque">
          {(Object.keys(ROTULO_ABA) as Aba[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={aba === item} onClick={() => { setParams({ aba: item }); setErro(''); setOk('') }}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', aba === item ? 'bg-ink text-white' : 'text-ink/60 hover:text-ink')}>
              {ROTULO_ABA[item]}
            </button>
          ))}
        </div>
      </header>

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {dados.erro ? <Aviso tom="erro"><p role="alert">{dados.erro}</p><Button type="button" variant="secondary" className="mt-2" onClick={dados.recarregar}>Tentar novamente</Button></Aviso> : null}
      {dados.carregando ? <Carregando texto="Carregando…" /> : null}

      {!dados.carregando && !dados.erro && aba === 'catalogo' ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_28rem]">
          <section className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" variant="secondary" onClick={() => { setEditando(null); setForm({ ...formVazio }); setOk('') }}><Plus className="h-4 w-4" aria-hidden="true" /> Novo item</Button>
              <select aria-label="Filtrar por categoria" className={cx(inputClass, 'w-auto')} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Todas as categorias</option>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
              </select>
              {catalogo.length ? <BotaoCsv arquivo="estoque-catalogo" cabecalhos={['Nome', 'Código', 'Categoria', 'Unidade', 'Mínimo', 'Preço sugerido', 'Ativo']}
                linhas={catalogo.map((i) => [i.nome, i.codigo, ROTULO_CATEGORIA[i.categoria], i.unidadeMedida, i.estoqueMinimo, i.precoSugeridoCentavos ? formatarPreco(i.precoSugeridoCentavos) : null, i.ativo ? 'sim' : 'não'])} /> : null}
            </div>
            {!catalogo.length ? <Vazio titulo="Catálogo vazio" texto="Cadastre os itens padrão da rede: insumos, cadeados, caixas de mudança, embalagens, limpeza e uniformes." /> : (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                {catalogo.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => { setEditando(i); setForm(paraForm(i)); setOk('') }} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper', editando?.id === i.id && 'bg-paper')}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{i.nome}{i.codigo ? <span className="ml-1.5 text-xs font-normal text-ink/45">{i.codigo}</span> : null}</span>
                        <span className="text-xs text-ink/45">
                          {ROTULO_CATEGORIA[i.categoria]} · {i.unidadeMedida} · mínimo {i.estoqueMinimo} · {i.precoSugeridoCentavos ? formatarPreco(i.precoSugeridoCentavos) : 'sem preço'}{i.geradoPorIA ? ` · IA: ${i.iaModelo}` : ''}
                        </span>
                      </span>
                      {i.ativo ? <Selo tom="lima">Ativo</Selo> : <Selo>Inativo</Selo>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {form ? (
            <section className="space-y-3 self-start rounded-3xl border border-line bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">{editando ? 'Editar item' : 'Novo item do catálogo'}</h2>
              <Campo label="Nome"><input className={inputClass} maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Código (opcional)"><input className={inputClass} maxLength={40} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></Campo>
                <Campo label="Categoria">
                  <select className={inputClass} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as ItemForm['categoria'] })}>
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
                  </select>
                </Campo>
                <Campo label="Unidade de medida">
                  <select className={inputClass} value={form.unidadeMedida} onChange={(e) => setForm({ ...form, unidadeMedida: e.target.value as ItemForm['unidadeMedida'] })}>
                    {UNIDADES_MEDIDA.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Campo>
                <Campo label="Estoque mínimo"><input className={inputClass} type="number" min={0} step={1} value={form.estoqueMinimo} onChange={(e) => setForm({ ...form, estoqueMinimo: Number(e.target.value) })} /></Campo>
                <Campo label="Preço sugerido (R$)" hint="Ex.: 12,90"><input className={inputClass} inputMode="decimal" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} /></Campo>
              </div>
              <Campo label="Descrição"><textarea className={inputClass} rows={2} maxLength={500} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Campo>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo no catálogo (itens não são apagados, só desativados)</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.geradoPorIA} onChange={(e) => setForm({ ...form, geradoPorIA: e.target.checked })} /> Texto criado ou revisado com IA</label>
              {form.geradoPorIA ? <Campo label="Qual IA / modelo"><input className={inputClass} maxLength={80} value={form.iaModelo} onChange={(e) => setForm({ ...form, iaModelo: e.target.value })} /></Campo> : null}
              <div className="flex gap-2">
                <Button type="button" onClick={() => void gravar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar item'}</Button>
                <Button type="button" variant="ghost" onClick={() => { setForm(null); setEditando(null) }}>Fechar</Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {!dados.carregando && !dados.erro && aba === 'rede' ? (
        <section className="space-y-4">
          <p className="text-sm text-ink/60">Unidades que já movimentaram, contaram ou pediram itens. Abaixo do mínimo = saldo menor que o mínimo do catálogo; zerado = saldo 0 ou menos.</p>
          {resumo.length ? <BotaoCsv arquivo="estoque-rede" cabecalhos={['Unidade', 'Zerados', 'Abaixo do mínimo', 'Pedidos em andamento', 'Último movimento', 'Última contagem']}
            linhas={resumo.map((u) => [u.unidadeNome, u.itensZerados, u.itensBaixos, u.pedidosAbertos, u.ultimoMovimentoMs ? formatarData(u.ultimoMovimentoMs) : null, u.ultimaContagemMs ? formatarData(u.ultimaContagemMs) : null])} /> : null}
          {!resumo.length ? <Vazio titulo="Nenhuma unidade com estoque ainda" texto="Quando as unidades lançarem movimentos, o resumo aparece aqui." /> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resumo.map((u) => (
                <button key={u.unidadeId} type="button" onClick={() => setUnidadeVista(u.unidadeId === unidadeVista ? '' : u.unidadeId)}
                  className={cx('space-y-1.5 rounded-2xl border bg-white p-4 text-left shadow-sm hover:border-brand', u.unidadeId === unidadeVista ? 'border-brand' : u.itensZerados + u.itensBaixos ? 'border-red-200' : 'border-line')}>
                  <p className="font-bold">{u.unidadeNome}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {u.itensZerados ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">{u.itensZerados} zerado(s)</span> : null}
                    {u.itensBaixos ? <Selo tom="alerta">{u.itensBaixos} abaixo do mínimo</Selo> : null}
                    {!u.itensZerados && !u.itensBaixos ? <Selo tom="lima">Tudo acima do mínimo</Selo> : null}
                    {u.pedidosAbertos ? <Selo tom="marca">{u.pedidosAbertos} pedido(s) em andamento</Selo> : null}
                  </div>
                  <p className="text-xs text-ink/50">Último movimento: {u.ultimoMovimentoMs ? formatarData(u.ultimoMovimentoMs) : '—'} · Última contagem: {u.ultimaContagemMs ? formatarData(u.ultimaContagemMs) : 'nunca'}</p>
                </button>
              ))}
            </div>
          )}
          {unidadeVista ? (
            <div className="space-y-2">
              <h2 className="text-lg font-bold">Saldo de {resumo.find((u) => u.unidadeId === unidadeVista)?.unidadeNome}</h2>
              <TabelaSaldo linhas={tabelaSaldos(dados.itens, dados.movimentos.filter((m) => m.unidadeId === unidadeVista))} />
            </div>
          ) : null}
        </section>
      ) : null}

      {!dados.carregando && !dados.erro && aba === 'pedidos' ? (
        <section className="space-y-3">
          <select aria-label="Status do pedido" className={cx(inputClass, 'w-auto')} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value as StatusPedido | 'ativos')}>
            <option value="ativos">Em andamento</option>
            {STATUS_PEDIDO.map((s) => <option key={s} value={s}>{ROTULO_STATUS_PEDIDO[s]}</option>)}
          </select>
          <PedidosRede
            pedidos={dados.pedidos.filter((p) => (statusFiltro === 'ativos' ? ['aberto', 'aprovado', 'enviado'].includes(p.status) : p.status === statusFiltro))}
            onFeito={(m) => { setOk(m); setErro(''); dados.recarregar() }}
            onErro={setErro}
          />
        </section>
      ) : null}

      {!dados.carregando && !dados.erro && aba === 'movimentos' ? <Historico movimentos={dados.movimentos} itens={dados.itens} mostrarUnidade /> : null}
    </div>
  )
}

function PedidosRede({ pedidos, onFeito, onErro }: { pedidos: Pedido[]; onFeito: (m: string) => void; onErro: (m: string) => void }) {
  const { user } = useAuth()
  const [obs, setObs] = useState<Record<string, string>>({})
  const [enviadas, setEnviadas] = useState<Record<string, string[]>>({})
  const [salvando, setSalvando] = useState(false)
  if (!pedidos.length) return <Vazio titulo="Nenhum pedido aqui" texto="Os pedidos de reposição das unidades aparecem nesta lista." />

  async function agir(p: Pedido, acao: 'aprovar' | 'enviar' | 'cancelar') {
    if (!user || salvando) return
    const texto = obs[p.id] ?? p.obsFranqueadora
    if (acao === 'cancelar' && texto.trim().length < 2) { onErro('Para cancelar, escreva o motivo para a unidade.'); return }
    if (acao === 'cancelar' && !window.confirm('Cancelar este pedido de reposição?')) return
    if (acao === 'enviar' && !window.confirm('Marcar este pedido como enviado? A unidade ainda precisa confirmar o recebimento.')) return
    setSalvando(true)
    try {
      if (acao === 'aprovar') { await aprovarPedido(user, p, texto); onFeito(`Pedido de ${p.unidadeNome} aprovado.`) }
      if (acao === 'enviar') {
        const qtds = p.itens.map((l, i) => Number(enviadas[p.id]?.[i] ?? l.quantidade))
        if (qtds.some((q) => !Number.isInteger(q) || q < 0 || q > 100_000)) { onErro('Quantidade enviada inválida.'); setSalvando(false); return }
        await enviarPedido(user, p, qtds, texto)
        onFeito(`Pedido de ${p.unidadeNome} marcado como enviado. A unidade confirma o recebimento e o estoque dela sobe.`)
      }
      if (acao === 'cancelar') { await cancelarPedidoRede(user, p, texto); onFeito('Pedido cancelado.') }
    } catch (falha) {
      onErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-2">
      {pedidos.map((p) => (
        <article key={p.id} className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{p.unidadeNome} · {formatarData(p.criadoEmMs)} · {p.solicitanteNome}</p>
            <StatusPedidoSelo status={p.status} />
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink/45"><tr><th className="py-1 font-semibold">Item</th><th className="py-1 text-right font-semibold">Pedido</th><th className="py-1 text-right font-semibold">Enviado</th></tr></thead>
            <tbody>
              {p.itens.map((l, i) => (
                <tr key={i}>
                  <td className="py-1">{l.itemNome}</td>
                  <td className="py-1 text-right tabular-nums">{l.quantidade} {l.unidadeMedida}</td>
                  <td className="py-1 text-right">
                    {p.status === 'aprovado' ? (
                      <div className="ml-auto w-24"><input aria-label={`Enviado de ${l.itemNome}`} className={cx(inputClass, 'py-1 text-right')} type="number" min={0} step={1}
                        value={enviadas[p.id]?.[i] ?? String(l.quantidade)}
                        onChange={(e) => { const atual = [...(enviadas[p.id] ?? p.itens.map((x) => String(x.quantidade)))]; atual[i] = e.target.value; setEnviadas({ ...enviadas, [p.id]: atual }) }} /></div>
                    ) : p.status === 'enviado' || p.status === 'recebido' ? <span className="tabular-nums">{l.quantidadeEnviada}</span> : <span className="text-ink/35">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.obsUnidade ? <p className="text-xs text-ink/55">Unidade: {p.obsUnidade}</p> : null}
          {p.obsFranqueadora ? <p className="text-xs text-brand-dark">Franqueadora: {p.obsFranqueadora}</p> : null}
          {p.status === 'aberto' || p.status === 'aprovado' ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
              <input aria-label="Observação para a unidade" placeholder="Observação para a unidade (obrigatória para cancelar)" className={cx(inputClass, 'min-w-0 flex-1 py-1')} maxLength={1000}
                value={obs[p.id] ?? ''} onChange={(e) => setObs({ ...obs, [p.id]: e.target.value })} />
              {p.status === 'aberto' ? <Button type="button" disabled={salvando} onClick={() => void agir(p, 'aprovar')}>Aprovar</Button> : null}
              {p.status === 'aprovado' ? <Button type="button" disabled={salvando} onClick={() => void agir(p, 'enviar')}>Marcar como enviado</Button> : null}
              <Button type="button" variant="ghost" disabled={salvando} onClick={() => void agir(p, 'cancelar')}>Cancelar</Button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}
