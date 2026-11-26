import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { ConfirmacaoPedido, focarPedido } from '../../components/ConfirmacaoPedido'
import { protocoloDe } from '../../lib/pedidosUnidade'
import { BotaoCsv } from '../../components/BotaoCsv'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import {
  MAX_ITENS_CONTAGEM,
  MAX_ITENS_PEDIDO,
  ROTULO_CATEGORIA,
  ROTULO_STATUS_PEDIDO,
  ROTULO_TIPO_MOV,
  TIPOS_MANUAIS,
  alertas,
  divergencias,
  formatarPreco,
  linhasContagem,
  saldos,
  sugestaoReposicao,
  tabelaSaldos,
  validarContagem,
  validarMovimento,
  validarPedido,
  type Contagem,
  type ItemEstoque,
  type Movimento,
  type Pedido,
  type TipoManual,
} from '../../lib/estoque'
import {
  cancelarContagem,
  cancelarPedidoUnidade,
  confirmarContagem,
  criarPedido,
  receberPedido,
  registrarMovimento,
  salvarContagem,
} from '../../lib/estoqueApi'
import { NivelSelo, StatusPedidoSelo, useEstoque, type UsoEstoque } from './partes'

type Aba = 'saldo' | 'movimentar' | 'historico' | 'contagem' | 'pedidos'
const ROTULO_ABA: Record<Aba, string> = { saldo: 'Saldo', movimentar: 'Movimentar', historico: 'Histórico', contagem: 'Contagem', pedidos: 'Pedidos de reposição' }

export function EstoquePage() {
  const dados = useEstoque()
  const [params, setParams] = useSearchParams()
  const alvo = params.get('pedido')
  const aba = (Object.keys(ROTULO_ABA).includes(params.get('aba') ?? '') ? params.get('aba') : alvo ? 'pedidos' : 'saldo') as Aba
  const [ok, setOk] = useState('')
  const [confirmado, setConfirmado] = useState<string | null>(null)
  const [rascunhoPedido, setRascunhoPedido] = useState<{ itemId: string; quantidade: number }[] | null>(null)

  const linhas = useMemo(() => tabelaSaldos(dados.itens, dados.movimentos), [dados.itens, dados.movimentos])
  const criticos = alertas(linhas)

  const alvoPronto = Boolean(alvo && aba === 'pedidos' && !dados.carregando && !dados.erro && dados.pedidos.some((p) => p.id === alvo))
  useEffect(() => {
    if (alvoPronto) focarPedido(`reposicao-${alvo}`)
  }, [alvo, alvoPronto])

  if (dados.gestor) return <Navigate to="/estoque/gestao" replace />
  if (!dados.carregando && !dados.participa) return <Navigate to="/" replace />

  const irPara = (item: Aba) => {
    setParams({ aba: item })
    setOk('')
    setConfirmado(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Controle de Estoque · {dados.pessoa?.unidade || 'Unidade'}</p>
          <h1 className="text-2xl font-black text-ink">Estoque da unidade</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-ink/65">Saldo de cada item da rede, entradas e saídas, contagem periódica e pedidos de reposição para a franqueadora.</p>
        </div>
        <div className="flex flex-wrap rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Seções do estoque">
          {(Object.keys(ROTULO_ABA) as Aba[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={aba === item} onClick={() => irPara(item)}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', aba === item ? 'bg-ink text-white' : 'text-ink/60 hover:text-ink')}>
              {ROTULO_ABA[item]}
            </button>
          ))}
        </div>
      </header>

      {dados.simulando ? <Aviso>Você está vendo como a unidade simulada. Nada é gravado nesta visão.</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {aba === 'pedidos' && confirmado ? (
        <ConfirmacaoPedido titulo="Pedido de reposição aberto" protocolo={protocoloDe('reposicao', confirmado)}
          situacao={ROTULO_STATUS_PEDIDO.aberto} acompanhar={() => {
            setParams({ aba: 'pedidos', pedido: confirmado })
            if (alvo === confirmado && alvoPronto) focarPedido(`reposicao-${confirmado}`)
          }} />
      ) : null}
      {dados.erro ? <Aviso tom="erro"><p role="alert">{dados.erro}</p><Button type="button" variant="secondary" className="mt-2" onClick={dados.recarregar}>Tentar novamente</Button></Aviso> : null}
      {dados.carregando ? <Carregando texto="Carregando o estoque…" /> : null}

      {!dados.carregando && !dados.erro && aba === 'saldo' ? (
        <section className="space-y-3">
          {criticos.length ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">{criticos.length} item(ns) abaixo do estoque mínimo: {criticos.slice(0, 4).map((l) => l.item.nome).join(', ')}{criticos.length > 4 ? '…' : ''}</p>
              {dados.ehFranqueado ? (
                <Button type="button" variant="secondary" onClick={() => { setRascunhoPedido(sugestaoReposicao(linhas)); irPara('pedidos') }}>Pedir reposição</Button>
              ) : null}
            </div>
          ) : dados.itens.length ? <Aviso tom="ok">Nenhum item abaixo do mínimo.</Aviso> : null}
          <TabelaSaldo linhas={linhas} />
        </section>
      ) : null}

      {!dados.carregando && !dados.erro && aba === 'movimentar' ? <Movimentar dados={dados} onFeito={(m) => { setOk(m); dados.recarregar() }} /> : null}
      {!dados.carregando && !dados.erro && aba === 'historico' ? <Historico movimentos={dados.movimentos} itens={dados.itens} /> : null}
      {!dados.carregando && !dados.erro && aba === 'contagem' ? <Contagens dados={dados} onFeito={(m) => { setOk(m); dados.recarregar() }} /> : null}
      {!dados.carregando && !dados.erro && aba === 'pedidos' ? (
        <Pedidos dados={dados} alvo={alvo} rascunho={rascunhoPedido} onRascunhoUsado={() => setRascunhoPedido(null)} onFeito={(m, id) => {
          setOk(m)
          setConfirmado(id ?? null)
          dados.recarregar()
        }} />
      ) : null}
    </div>
  )
}

export function TabelaSaldo({ linhas }: { linhas: ReturnType<typeof tabelaSaldos> }) {
  if (!linhas.length) return <Vazio titulo="Catálogo vazio" texto="Quando a franqueadora cadastrar os itens padrão da rede, eles aparecem aqui." />
  return (
    <div className="space-y-3">
      <BotaoCsv arquivo="estoque-saldo" cabecalhos={['Item', 'Código', 'Categoria', 'Saldo', 'Unidade', 'Mínimo', 'Situação', 'Preço sugerido']}
        linhas={linhas.map((l) => [l.item.nome, l.item.codigo, ROTULO_CATEGORIA[l.item.categoria], l.saldo, l.item.unidadeMedida, l.item.estoqueMinimo,
          !l.item.ativo ? 'fora do catálogo' : l.nivel, l.item.precoSugeridoCentavos ? formatarPreco(l.item.precoSugeridoCentavos) : null])} />
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-paper text-xs uppercase tracking-wide text-ink/50">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Item</th>
            <th className="px-4 py-2.5 font-semibold">Categoria</th>
            <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
            <th className="px-4 py-2.5 text-right font-semibold">Mínimo</th>
            <th className="px-4 py-2.5 font-semibold">Situação</th>
            <th className="px-4 py-2.5 text-right font-semibold">Preço sugerido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {linhas.map((l) => (
            <tr key={l.item.id} className={cx(l.nivel !== 'ok' && 'bg-red-50/40')}>
              <td className="px-4 py-2.5">
                <span className="font-medium">{l.item.nome}</span>
                {l.item.codigo ? <span className="ml-1.5 text-xs text-ink/45">{l.item.codigo}</span> : null}
                {!l.item.ativo ? <span className="ml-1.5"><Selo>Inativo</Selo></span> : null}
              </td>
              <td className="px-4 py-2.5 text-ink/70">{ROTULO_CATEGORIA[l.item.categoria]}</td>
              <td className="px-4 py-2.5 text-right font-bold tabular-nums">{l.saldo} <span className="font-normal text-ink/45">{l.item.unidadeMedida}</span></td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink/70">{l.item.estoqueMinimo}</td>
              <td className="px-4 py-2.5">{l.item.ativo ? <NivelSelo nivel={l.nivel} /> : <span className="text-xs text-ink/45">fora do catálogo</span>}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink/70">{l.item.precoSugeridoCentavos ? formatarPreco(l.item.precoSugeridoCentavos) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  )
}

function Movimentar({ dados, onFeito }: { dados: UsoEstoque; onFeito: (msg: string) => void }) {
  const ativos = dados.itens.filter((i) => i.ativo)
  const mapa = useMemo(() => saldos(dados.movimentos), [dados.movimentos])
  const [itemId, setItemId] = useState('')
  const [tipo, setTipo] = useState<TipoManual>('entrada')
  const [quantidade, setQuantidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const todos = dados.itens.filter((i) => i.ativo || (mapa.get(i.id) ?? 0) > 0)
  const opcoes = tipo === 'entrada' ? ativos : todos
  const item = opcoes.find((i) => i.id === itemId) ?? null
  const saldoAtual = item ? mapa.get(item.id) ?? 0 : 0

  async function gravar() {
    if (salvando || dados.simulando) return
    if (!dados.pessoa || !item) { setErro('Escolha o item.'); return }
    const qtd = Number(quantidade)
    const erros = validarMovimento(tipo, qtd, motivo, saldoAtual)
    if (erros.length) { setErro(erros.join(' ')); return }
    if (!window.confirm(`Registrar ${ROTULO_TIPO_MOV[tipo].toLowerCase()} de ${qtd} ${item.unidadeMedida} de ${item.nome}? Movimentos não podem ser editados.`)) return
    setSalvando(true)
    setErro('')
    try {
      await registrarMovimento(dados.pessoa, item, tipo, qtd, motivo)
      setQuantidade('')
      setMotivo('')
      onFeito(`${ROTULO_TIPO_MOV[tipo]} de ${qtd} ${item.unidadeMedida} de ${item.nome} registrada.`)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="max-w-xl space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Registrar movimento</h2>
      <p className="text-sm text-ink/60">Movimentos não podem ser editados nem apagados. Errou? Faça uma contagem: o franqueado confirma e o ajuste corrige o saldo.</p>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <Campo label="Tipo">
        <div className="flex flex-wrap gap-2">
          {TIPOS_MANUAIS.map((t) => (
            <button key={t} type="button" onClick={() => setTipo(t)} aria-pressed={tipo === t}
              className={cx('rounded-lg border px-3 py-1.5 text-sm font-semibold', tipo === t ? 'border-ink bg-ink text-white' : 'border-line text-ink/70 hover:bg-paper')}>
              {ROTULO_TIPO_MOV[t]}
            </button>
          ))}
        </div>
      </Campo>
      <Campo label="Item">
        <select className={inputClass} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">Escolha…</option>
          {opcoes.map((i) => <option key={i.id} value={i.id}>{i.nome} ({ROTULO_CATEGORIA[i.categoria]})</option>)}
        </select>
      </Campo>
      {item ? <p className="text-sm text-ink/70">Saldo atual: <strong>{saldoAtual} {item.unidadeMedida}</strong> · mínimo {item.estoqueMinimo}</p> : null}
      <Campo label={`Quantidade${item ? ` (${item.unidadeMedida})` : ''}`}>
        <input className={inputClass} type="number" min={1} step={1} inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
      </Campo>
      <Campo label={tipo === 'saida' ? 'Motivo (obrigatório)' : 'Motivo / observação'} hint={tipo === 'saida' ? 'Ex.: uso na limpeza do corredor, avaria, troca de cadeado do box 12.' : undefined}>
        <input className={inputClass} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <Button type="button" onClick={() => void gravar()} disabled={salvando || dados.simulando}>{salvando ? 'Gravando…' : 'Registrar'}</Button>
    </section>
  )
}

export function Historico({ movimentos, itens, mostrarUnidade = false }: { movimentos: Movimento[]; itens: ItemEstoque[]; mostrarUnidade?: boolean }) {
  const [itemId, setItemId] = useState('')
  const lista = (itemId ? movimentos.filter((m) => m.itemId === itemId) : movimentos).slice(0, 300)
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
      <div className="max-w-xs">
        <Campo label="Filtrar por item">
          <select className={inputClass} value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">Todos os itens</option>
            {itens.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>
        </Campo>
      </div>
        {lista.length ? <BotaoCsv arquivo="estoque-movimentos" cabecalhos={mostrarUnidade ? ['Quando', 'Unidade', 'Item', 'Tipo', 'Quantidade', 'Motivo', 'Quem'] : ['Quando', 'Item', 'Tipo', 'Quantidade', 'Motivo', 'Quem']}
          linhas={lista.map((m) => {
            const tipo = `${ROTULO_TIPO_MOV[m.tipo]}${m.origem !== 'manual' ? (m.origem === 'contagem' ? ' (contagem)' : ' (pedido)') : ''}`
            const qtd = `${m.delta > 0 ? '+' : ''}${m.delta} ${m.unidadeMedida}`
            return mostrarUnidade
              ? [formatarData(m.criadoEmMs), m.unidadeNome || m.unidadeId, m.itemNome, tipo, qtd, m.motivo, m.nome]
              : [formatarData(m.criadoEmMs), m.itemNome, tipo, qtd, m.motivo, m.nome]
          })} /> : null}
      </div>
      {!lista.length ? <Vazio titulo="Nenhum movimento" texto="Entradas, saídas, vendas e ajustes aparecem aqui, do mais recente para o mais antigo." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wide text-ink/50">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Quando</th>
                {mostrarUnidade ? <th className="px-4 py-2.5 font-semibold">Unidade</th> : null}
                <th className="px-4 py-2.5 font-semibold">Item</th>
                <th className="px-4 py-2.5 font-semibold">Tipo</th>
                <th className="px-4 py-2.5 text-right font-semibold">Qtd.</th>
                <th className="px-4 py-2.5 font-semibold">Motivo</th>
                <th className="px-4 py-2.5 font-semibold">Quem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lista.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink/70">{formatarData(m.criadoEmMs)}</td>
                  {mostrarUnidade ? <td className="px-4 py-2.5">{m.unidadeNome || m.unidadeId}</td> : null}
                  <td className="px-4 py-2.5 font-medium">{m.itemNome}</td>
                  <td className="px-4 py-2.5">{ROTULO_TIPO_MOV[m.tipo]}{m.origem !== 'manual' ? <span className="ml-1 text-xs text-ink/45">({m.origem === 'contagem' ? 'contagem' : 'pedido'})</span> : null}</td>
                  <td className={cx('px-4 py-2.5 text-right font-bold tabular-nums', m.delta < 0 ? 'text-red-700' : 'text-lime-dark')}>{m.delta > 0 ? '+' : ''}{m.delta} <span className="font-normal text-ink/45">{m.unidadeMedida}</span></td>
                  <td className="px-4 py-2.5 text-ink/70">{m.motivo || '—'}</td>
                  <td className="px-4 py-2.5 text-ink/70">{m.nome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Contagens({ dados, onFeito }: { dados: UsoEstoque; onFeito: (msg: string) => void }) {
  const aberta = dados.contagens.find((c) => c.status === 'aberta') ?? null
  const mapa = useMemo(() => saldos(dados.movimentos), [dados.movimentos])
  const contaveis = dados.itens.filter((i) => i.ativo || (mapa.get(i.id) ?? 0) !== 0).slice(0, MAX_ITENS_CONTAGEM)
  const [contados, setContados] = useState<Record<string, string>>({})
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberta) return
    setContados(Object.fromEntries(aberta.itens.map((l) => [l.itemId, String(l.contado)])))
    setObs(aberta.obs)
  }, [aberta])

  const numeros = Object.fromEntries(Object.entries(contados).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]))
  const linhas = linhasContagem(contaveis, mapa, numeros)

  async function executar(acao: 'salvar' | 'confirmar' | 'cancelar') {
    if (!dados.pessoa || salvando || dados.simulando) return
    if (acao !== 'cancelar') {
      const erros = validarContagem(linhas)
      if (erros.length) { setErro(erros.join(' ')); return }
    }
    if (acao === 'confirmar' && !window.confirm('Confirmar esta contagem? As diferenças viram ajustes no estoque e não podem ser desfeitas.')) return
    if (acao === 'cancelar' && !window.confirm('Cancelar esta contagem? Nenhum ajuste será gerado.')) return
    setSalvando(true)
    setErro('')
    try {
      if (acao === 'cancelar' && aberta) {
        await cancelarContagem(dados.pessoa, aberta)
        onFeito('Contagem cancelada. Nenhum ajuste foi gerado.')
      } else if (acao === 'salvar') {
        await salvarContagem(dados.pessoa, aberta, linhas, obs)
        onFeito('Contagem salva. O franqueado confere e confirma para gerar os ajustes.')
      } else {
        const id = await salvarContagem(dados.pessoa, aberta, linhas, obs)
        const contagem: Contagem = { ...(aberta ?? { id, unidadeId: '', unidadeNome: '', status: 'aberta', totalDivergencias: 0, criadoPorNome: '', criadoEmMs: Date.now(), confirmadoNome: '', confirmadoEmMs: 0, atualizadoPorNome: '', atualizadoEmMs: 0 }), id, itens: linhas, obs }
        const n = await confirmarContagem(dados.pessoa, contagem, mapa, obs)
        onFeito(n ? `Contagem confirmada: ${n} ajuste(s) lançado(s) no estoque.` : 'Contagem confirmada: o físico bateu com o sistema, nenhum ajuste.')
      }
      if (acao !== 'salvar') setContados({})
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  const anteriores = dados.contagens.filter((c) => c.status !== 'aberta')
  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">{aberta ? 'Contagem em andamento' : 'Nova contagem de inventário'}</h2>
          {aberta ? <span className="text-xs text-ink/50">iniciada por {aberta.criadoPorNome} em {formatarData(aberta.criadoEmMs)}</span> : null}
        </div>
        <p className="text-sm text-ink/60">Conte o físico e digite a quantidade. Deixe em branco o que não contou. Ao confirmar, cada diferença vira um ajuste (só o franqueado confirma).</p>
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        {!contaveis.length ? <Vazio titulo="Nada para contar" texto="O catálogo da rede ainda está vazio." /> : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 text-right font-semibold">Sistema</th>
                  <th className="px-3 py-2 font-semibold">Contado</th>
                  <th className="px-3 py-2 text-right font-semibold">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {contaveis.map((i) => {
                  const linha = linhas.find((l) => l.itemId === i.id)
                  return (
                    <tr key={i.id}>
                      <td className="px-3 py-1.5 font-medium">{i.nome}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-ink/70">{mapa.get(i.id) ?? 0}</td>
                      <td className="px-3 py-1.5">
                        <div className="w-28"><input aria-label={`Contado de ${i.nome}`} className={cx(inputClass, 'py-1')} type="number" min={0} step={1} inputMode="numeric"
                          value={contados[i.id] ?? ''} onChange={(e) => setContados({ ...contados, [i.id]: e.target.value })} /></div>
                      </td>
                      <td className={cx('px-3 py-1.5 text-right font-bold tabular-nums', linha && linha.diferenca < 0 && 'text-red-700', linha && linha.diferenca > 0 && 'text-lime-dark')}>
                        {linha ? `${linha.diferenca > 0 ? '+' : ''}${linha.diferenca}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Campo label="Observação"><textarea className={inputClass} rows={2} maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
        <p className="text-sm text-ink/70">{linhas.length} item(ns) contado(s) · {divergencias(linhas)} divergência(s)</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void executar('salvar')} disabled={salvando || dados.simulando}>Salvar contagem</Button>
          {dados.ehFranqueado ? <Button type="button" onClick={() => void executar('confirmar')} disabled={salvando || dados.simulando}>Confirmar e gerar ajustes</Button> : null}
          {dados.ehFranqueado && aberta ? <Button type="button" variant="ghost" onClick={() => void executar('cancelar')} disabled={salvando || dados.simulando}>Cancelar contagem</Button> : null}
        </div>
        {!dados.ehFranqueado ? <p className="text-xs text-ink/50">A equipe salva a contagem; o franqueado confere e confirma os ajustes.</p> : null}
      </div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink/50">Contagens anteriores</h3>
      {!anteriores.length ? <Vazio titulo="Nenhuma contagem concluída" texto="As contagens confirmadas ou canceladas ficam aqui." /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {anteriores.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>{formatarData(c.criadoEmMs)} · {c.itens.length} item(ns) · {c.totalDivergencias} divergência(s){c.obs ? ` · ${c.obs}` : ''}</span>
              {c.status === 'confirmada' ? <Selo tom="lima">Confirmada por {c.confirmadoNome}</Selo> : <Selo>Cancelada</Selo>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Pedidos({ dados, alvo, rascunho, onRascunhoUsado, onFeito }: {
  dados: UsoEstoque
  alvo: string | null
  rascunho: { itemId: string; quantidade: number }[] | null
  onRascunhoUsado: () => void
  onFeito: (msg: string, id?: string) => void
}) {
  const ativos = dados.itens.filter((i) => i.ativo)
  const [linhas, setLinhas] = useState<{ itemId: string; quantidade: string }[]>([])
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [obsAcao, setObsAcao] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!rascunho) return
    setLinhas(rascunho.map((r) => ({ itemId: r.itemId, quantidade: String(r.quantidade) })))
    onRascunhoUsado()
  }, [rascunho, onRascunhoUsado])

  async function enviar() {
    if (!dados.pessoa || salvando || dados.simulando) return
    const escolhidas = linhas.filter((l) => l.itemId)
    const prontas = escolhidas.map((l) => {
      const item = ativos.find((i) => i.id === l.itemId)!
      return { itemId: item.id, itemNome: item.nome, unidadeMedida: item.unidadeMedida, quantidade: Number(l.quantidade), quantidadeEnviada: 0 }
    })
    const erros = validarPedido(prontas)
    if (new Set(prontas.map((p) => p.itemId)).size !== prontas.length) erros.push('Cada item aparece uma vez só.')
    if (erros.length) { setErro(erros.join(' ')); return }
    setSalvando(true)
    setErro('')
    try {
      const id = await criarPedido(dados.pessoa, prontas, obs)
      setLinhas([])
      setObs('')
      onFeito('Pedido de reposição enviado para a franqueadora.', id)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  async function agir(p: Pedido, acao: 'cancelar' | 'receber') {
    if (!dados.pessoa || salvando) return
    if (acao === 'cancelar' && !window.confirm('Cancelar este pedido de reposição?')) return
    if (acao === 'receber' && !window.confirm('Confirmar o recebimento? As quantidades enviadas entram no estoque da unidade.')) return
    setSalvando(true)
    setErro('')
    try {
      if (acao === 'cancelar') {
        await cancelarPedidoUnidade(dados.pessoa, p, obsAcao[p.id] ?? p.obsUnidade)
        onFeito('Pedido cancelado.')
      } else {
        const n = await receberPedido(dados.pessoa, p, obsAcao[p.id] ?? p.obsUnidade)
        onFeito(`Recebimento confirmado: ${n} entrada(s) lançada(s) no estoque.`)
      }
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_26rem]">
      <div className="space-y-2">
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        {!dados.pedidos.length ? <Vazio titulo="Nenhum pedido ainda" texto="Pedidos de reposição enviados à franqueadora aparecem aqui com o andamento." /> : null}
        {dados.pedidos.map((p) => (
          <article key={p.id} id={`reposicao-${p.id}`} tabIndex={-1}
            className={cx('space-y-2 rounded-2xl border bg-white p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-brand-dark', alvo === p.id ? 'border-brand' : 'border-line')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Pedido de {formatarData(p.criadoEmMs)} · {p.solicitanteNome}</p>
              <StatusPedidoSelo status={p.status} />
            </div>
            <p className="text-xs text-ink-soft" translate="no">Protocolo {protocoloDe('reposicao', p.id)}</p>
            <ul className="text-sm text-ink/75">
              {p.itens.map((l, i) => <li key={i}>{l.itemNome}: {l.quantidade} {l.unidadeMedida}{p.status === 'enviado' || p.status === 'recebido' ? ` · enviado ${l.quantidadeEnviada}` : ''}</li>)}
            </ul>
            {p.obsUnidade ? <p className="text-xs text-ink/55">Unidade: {p.obsUnidade}</p> : null}
            {p.obsFranqueadora ? <p className="text-xs text-brand-dark">Franqueadora: {p.obsFranqueadora}</p> : null}
            {dados.ehFranqueado && (p.status === 'aberto' || p.status === 'enviado') ? (
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-2">
                <input aria-label="Observação" placeholder="Observação (opcional)" className={cx(inputClass, 'min-w-0 flex-1 py-1')} maxLength={1000}
                  value={obsAcao[p.id] ?? ''} onChange={(e) => setObsAcao({ ...obsAcao, [p.id]: e.target.value })} />
                {p.status === 'aberto' ? <Button type="button" variant="ghost" disabled={salvando} onClick={() => void agir(p, 'cancelar')}>Cancelar pedido</Button> : null}
                {p.status === 'enviado' ? <Button type="button" disabled={salvando} onClick={() => void agir(p, 'receber')}>Confirmar recebimento</Button> : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {dados.ehFranqueado ? (
        <div className="space-y-3 self-start rounded-3xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Novo pedido de reposição</h2>
          {linhas.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <select aria-label="Item" className={cx(inputClass, 'min-w-0 flex-1')} value={l.itemId} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}>
                <option value="">Escolha…</option>
                {ativos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
              <div className="w-24 shrink-0"><input aria-label="Quantidade" className={inputClass} type="number" min={1} step={1} value={l.quantidade} onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} /></div>
              <button type="button" aria-label="Tirar item" className="rounded-lg p-2 text-ink/50 hover:bg-paper" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" variant="secondary" disabled={linhas.length >= MAX_ITENS_PEDIDO} onClick={() => setLinhas([...linhas, { itemId: '', quantidade: '1' }])}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar item</Button>
          <Campo label="Observação para a franqueadora"><textarea className={inputClass} rows={2} maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
          <Button type="button" onClick={() => void enviar()} disabled={salvando || dados.simulando || !linhas.length}>Enviar pedido</Button>
        </div>
      ) : (
        <Aviso>Só o franqueado envia pedidos de reposição e confirma o recebimento.</Aviso>
      )}
    </section>
  )
}
