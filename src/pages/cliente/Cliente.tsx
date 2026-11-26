import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Vazio, inputClass } from '../../components/ui'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import {
  ITENS_VAZIOS,
  RECADOS_NO_LINK,
  ROTULO_VISITA,
  ROTULO_RESUMO,
  ativarECopiar,
  centavos,
  estadoResumo,
  formatarCompetencia,
  formatarDiaISO,
  formatarReais,
  hojeISO,
  linkPainel,
  primeiroNomeDe,
  proximaCompetencia,
  resumoCobrancas,
  situacao,
  validarCliente,
  validarCobranca,
  validarRecado,
  vencimentoDe,
  type Cliente,
  type ClienteForm,
  type ItensPainel,
  type Painel,
} from '../../lib/cliente'
import { agendarVisita, atualizarPainel, carregarItens, lancarCobranca, marcarCobranca, mudarVisita, publicarRecado, salvarCliente, trocarLink, type MudancaPainel } from '../../lib/clienteApi'
import { CamposCliente } from './Clientes'
import { SituacaoSelo, diaDe, useClientes } from './partes'

const paraForm = (c: Cliente): ClienteForm => ({
  nome: c.nome, telefone: c.telefone, email: c.email, box: c.box, contratoInicio: diaDe(c.contratoInicioMs), contratoFim: diaDe(c.contratoFimMs),
  valorMensal: (c.valorMensalCentavos / 100).toFixed(2).replace('.', ','), diaVencimento: String(c.diaVencimento), obs: c.obs,
})

export function ClientePage() {
  const { id = '' } = useParams()
  const dados = useClientes({ incluirCobrancas: false })
  const cliente = dados.clientes.find((c) => c.id === id) ?? null
  const painel = cliente ? dados.paineis.get(cliente.id) ?? null : null
  const [ok, setOk] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [edit, setEdit] = useState<ClienteForm | null>(null)
  const [itens, setItens] = useState<ItensPainel>(ITENS_VAZIOS)
  const [estadoItens, setEstadoItens] = useState<{ token: string; tique: number; erro: boolean } | null>(null)
  const [tique, setTique] = useState(0)
  const recarregarItens = useCallback(() => setTique((t) => t + 1), [])
  const token = dados.participa ? painel?.token ?? '' : ''
  useEffect(() => {
    if (!token) return
    let vivo = true
    void carregarItens(token).then((r) => {
      if (!vivo) return
      setItens(r)
      setEstadoItens({ token, tique, erro: false })
    }).catch(() => {
      if (vivo) setEstadoItens({ token, tique, erro: true })
    })
    return () => { vivo = false }
  }, [token, tique])

  async function acao(fn: () => Promise<unknown>, msg: string) {
    if (salvando) return false
    setSalvando(true)
    setErro('')
    setOk('')
    try {
      await fn()
      setOk(msg)
      dados.recarregar()
      return true
    } catch (falha) {
      setErro(mensagemErro(falha))
      return false
    } finally {
      setSalvando(false)
    }
  }

  if (!dados.participa) return <div className="mx-auto max-w-3xl"><Vazio titulo="Painel do Cliente é da unidade" texto="Só o franqueado e a equipe com o módulo acessam os clientes." /></div>
  if (dados.carregando && !cliente) return <Carregando texto="Carregando o cliente…" />
  if (dados.erro) return <div className="space-y-2"><Aviso tom="erro">Não foi possível carregar o cliente.</Aviso><Button type="button" variant="secondary" onClick={dados.recarregar}>Tentar novamente</Button></div>
  if (!cliente || !painel) return <div className="mx-auto max-w-3xl space-y-3"><Vazio titulo="Cliente não encontrado" texto="Ele pode ser de outra unidade ou o link está errado." /><Link className="text-sm font-semibold text-brand-dark" to="/clientes">Voltar aos clientes</Link></div>

  const itensAtuais = estadoItens?.token === token ? estadoItens : null
  const atualizandoItens = itensAtuais?.tique !== tique
  const pessoa = dados.pessoa
  const mudar = (m: MudancaPainel, msg: string) => pessoa ? acao(() => atualizarPainel(painel, m), msg) : Promise.resolve(false)
  const item = (fn: () => Promise<unknown>, msg: string) => acao(fn, msg).then((r) => { if (r) recarregarItens(); return r })

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Link to="/clientes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Clientes</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Cliente · {cliente.box} · desde {formatarData(cliente.contratoInicioMs).split(',')[0]}</p>
          <h1 className="text-2xl font-black text-ink">{cliente.nome}</h1>
          <p className="text-sm text-ink/65">{formatarReais(cliente.valorMensalCentavos)}/mês · vence todo dia {cliente.diaVencimento}{cliente.status === 'encerrado' ? ' · contrato encerrado' : ''}</p>
        </div>
      </header>
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {!itensAtuais || (itensAtuais.erro && atualizandoItens) ? <Carregando texto="Carregando cobranças, visitas e recados…" /> : itensAtuais.erro ? (
            <div className="space-y-2"><Aviso tom="erro">Não foi possível carregar cobranças, visitas e recados.</Aviso><Button type="button" variant="secondary" onClick={recarregarItens}>Tentar novamente</Button></div>
          ) : <>
            {atualizandoItens ? <Carregando texto="Atualizando cobranças, visitas e recados…" /> : null}
            <Cobrancas painel={painel} cliente={cliente} itens={itens} salvando={salvando || atualizandoItens} item={item} />
            <Visitas painel={painel} itens={itens} salvando={salvando || atualizandoItens} item={item} />
            <Recados painel={painel} itens={itens} autor={primeiroNomeDe(pessoa?.nome ?? '')} salvando={salvando || atualizandoItens} item={item} />
          </>}
        </div>
        <div className="space-y-5">
          <LinkCard key={token} painel={painel} cliente={cliente} salvando={salvando || dados.carregando}
            ativarECopiarLink={async (copiar) => {
              setSalvando(true)
              setErro('')
              setOk('')
              try {
                const resultado = await ativarECopiar({ ativar: () => atualizarPainel(painel, { ativo: true }), copiar })
                if (resultado !== 'falha_ativacao') dados.recarregar()
                return resultado
              } finally {
                setSalvando(false)
              }
            }}
            desativar={() => void mudar({ ativo: false }, 'Link desativado: quem tiver o endereço não vê mais nada.')}
            contato={(contatoUnidade) => void mudar({ contatoUnidade: contatoUnidade.trim().slice(0, 120) }, 'Contato da unidade atualizado no link.')}
            podeTrocar={!!itensAtuais && !itensAtuais.erro && !atualizandoItens}
            trocar={() => pessoa && window.confirm('Gerar um link novo? O endereço anterior deixará de funcionar.') && void acao(() => trocarLink(pessoa, cliente, painel, itens), 'Link trocado. O endereço antigo deixou de funcionar.')} />
          <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Cadastro e contrato</h2>
            <p className="text-xs text-ink/50">Telefone, e-mail, sobrenome e observação ficam só com a unidade.</p>
            {edit ? (
              <>
                <CamposCliente f={edit} setF={setEdit} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={salvando} onClick={() => {
                    const erros = validarCliente(edit)
                    if (erros.length) { setErro(erros.join(' ')); return }
                    if (pessoa) void acao(() => salvarCliente(pessoa, cliente, edit, cliente.status), 'Cadastro salvo.').then((r) => r && setEdit(null))
                  }}>Salvar</Button>
                  <Button type="button" variant="ghost" disabled={salvando} onClick={() => setEdit(null)}>Cancelar</Button>
                </div>
              </>
            ) : (
              <>
                <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
                  <dt className="text-ink/50">Telefone</dt><dd>{cliente.telefone || '—'}</dd>
                  <dt className="text-ink/50">E-mail</dt><dd>{cliente.email || '—'}</dd>
                  <dt className="text-ink/50">Contrato</dt><dd>{formatarDiaISO(diaDe(cliente.contratoInicioMs))}{cliente.contratoFimMs ? ` a ${formatarDiaISO(diaDe(cliente.contratoFimMs))}` : ' · sem prazo'}</dd>
                  <dt className="text-ink/50">Observação</dt><dd>{cliente.obs || '—'}</dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEdit(paraForm(cliente))}>Editar</Button>
                  {cliente.status === 'ativo' ? (
                    <Button type="button" variant="ghost" disabled={salvando} onClick={() => pessoa && window.confirm('Encerrar o contrato e desativar o link do cliente? O histórico será mantido.') && void acao(() => salvarCliente(pessoa, cliente, paraForm(cliente), 'encerrado'), 'Contrato encerrado e link desativado (nada é apagado).')}>Encerrar contrato</Button>
                  ) : (
                    <Button type="button" variant="ghost" disabled={salvando} onClick={() => pessoa && void acao(() => salvarCliente(pessoa, cliente, paraForm(cliente), 'ativo'), 'Contrato reativado.')}>Reativar contrato</Button>
                  )}
                </div>
                <p className="text-[11px] text-ink/40">Atualizado por {cliente.atualizadoPorNome} em {formatarData(cliente.atualizadoEmMs)}.</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

type Item = (fn: () => Promise<unknown>, msg: string) => Promise<boolean>

type ResultadoAtivacao = Awaited<ReturnType<typeof ativarECopiar>>

const feedbackLink = {
  copiado: { tom: 'ok', texto: 'Link copiado.' },
  erro_copia: { tom: 'erro', texto: 'Não foi possível copiar. Selecione o endereço acima para copiar manualmente.' },
  ativado_e_copiado: { tom: 'ok', texto: 'Link ativado e copiado. Já pode enviar ao cliente.' },
  ativado_sem_copia: { tom: 'erro', texto: 'Link ativado, mas o navegador não deixou copiar. Selecione o endereço acima ou toque em “Copiar link”.' },
  falha_ativacao: { tom: 'erro', texto: 'Não foi possível ativar o link, então nada foi copiado. Confira a conexão e toque em “Ativar e copiar link” de novo. Se continuar, use “Gerar link novo”.' },
} as const

function LinkCard({ painel, cliente, salvando, ativarECopiarLink, desativar, contato, trocar, podeTrocar }: {
  painel: Painel
  cliente: Cliente
  salvando: boolean
  ativarECopiarLink: (copiar: () => Promise<void>) => Promise<ResultadoAtivacao>
  desativar: () => void
  contato: (c: string) => void
  trocar: () => void
  podeTrocar: boolean
}) {
  const url = linkPainel(painel.token)
  const [feedback, setFeedback] = useState<keyof typeof feedbackLink | null>(null)
  const [c, setC] = useState(painel.contatoUnidade)
  const copiarEndereco = () => navigator.clipboard.writeText(url)

  async function copiar() {
    try {
      await copiarEndereco()
      setFeedback('copiado')
    } catch {
      setFeedback('erro_copia')
    }
  }

  async function ativarLink() {
    setFeedback(null)
    const resultado = await ativarECopiarLink(copiarEndereco)
    setFeedback(resultado === 'copiado' ? 'ativado_e_copiado' : resultado)
  }
  return (
    <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Link do cliente</h2>{painel.ativo ? <span className="rounded-full bg-lime-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-lime-800">Ativo</span> : <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold uppercase text-ink/50">Desativado</span>}</div>
      <p className="text-xs text-ink/55">Sem senha: quem tiver o endereço vê o primeiro nome, o box, o contrato, as cobranças, as visitas e os recados. Envie só para o cliente.</p>
      <p className="break-all rounded-xl bg-paper px-3 py-2 font-mono text-[11px] text-ink/70" data-link-painel>{url}</p>
      <div className="flex flex-wrap gap-2">
        {painel.ativo ? (
          <>
            <Button type="button" variant="secondary" disabled={salvando} onClick={() => void copiar()}>
              <Copy className="h-4 w-4" aria-hidden="true" /> Copiar link
            </Button>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-paper">
              <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver como o cliente
            </a>
            <Button type="button" variant="ghost" disabled={salvando} onClick={() => { setFeedback(null); desativar() }}>Desativar link</Button>
          </>
        ) : cliente.status === 'ativo' ? (
          <Button type="button" disabled={salvando} onClick={() => void ativarLink()}>Ativar e copiar link</Button>
        ) : null}
        <Button type="button" variant="ghost" disabled={salvando || !podeTrocar} onClick={trocar}>Gerar link novo</Button>
      </div>
      {!painel.ativo && cliente.status === 'encerrado' ? (
        <p className="text-sm text-ink-soft">Contrato encerrado: reative o contrato para ativar o link.</p>
      ) : null}
      {feedback ? (
        <Aviso tom={feedbackLink[feedback].tom}><p role={feedbackLink[feedback].tom === 'erro' ? 'alert' : 'status'}>{feedbackLink[feedback].texto}</p></Aviso>
      ) : null}
      <Campo label="Contato da unidade (aparece no link)">
        <div className="flex gap-2"><input className={inputClass} maxLength={120} value={c} onChange={(e) => setC(e.target.value)} /><Button type="button" variant="secondary" disabled={salvando || c === painel.contatoUnidade} onClick={() => contato(c)}>Salvar</Button></div>
      </Campo>
    </section>
  )
}

function Cobrancas({ painel, cliente, itens, salvando, item }: { painel: Painel; cliente: Cliente; itens: ItensPainel; salvando: boolean; item: Item }) {
  const hoje = useMemo(() => hojeISO(), [])
  const comp = proximaCompetencia(itens.cobrancas)
  const [n, setN] = useState({ competencia: comp, valor: (cliente.valorMensalCentavos / 100).toFixed(2).replace('.', ','), vencimento: vencimentoDe(comp, cliente.diaVencimento) })
  const [erro, setErro] = useState('')
  const r = resumoCobrancas(itens.cobrancas, hoje)
  const estado = estadoResumo(itens.cobrancas, hoje)
  useEffect(() => { setN((x) => ({ ...x, competencia: comp, vencimento: vencimentoDe(comp, cliente.diaVencimento) })) }, [comp, cliente.diaVencimento])

  function incluir() {
    const erros = validarCobranca(n)
    if (itens.cobrancas.some((c) => c.competencia === n.competencia)) erros.push('Já existe cobrança para esse mês.')
    if (erros.length) { setErro(erros.join(' ')); return }
    setErro('')
    void item(() => lancarCobranca(painel, { competencia: n.competencia, valorCentavos: centavos(n.valor), vencimento: n.vencimento, status: 'pendente', pagoEm: '' }), `Cobrança de ${formatarCompetencia(n.competencia)} lançada.`)
  }

  return (
    <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Cobranças</h2>
        <div className="text-sm text-ink-soft">
          <span className="font-semibold">{ROTULO_RESUMO[estado]}</span>
          {estado === 'em_atraso' || estado === 'pendente' ? (
            <span> · Em aberto <b className="tabular-nums">{formatarReais(r.emAbertoCentavos)}</b>{r.atrasadas ? <span className="text-red-700"> · {r.atrasadas} atrasada(s)</span> : null}</span>
          ) : null}
        </div>
      </div>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Campo label="Mês de referência"><input className={inputClass} type="month" value={n.competencia} onChange={(e) => setN({ ...n, competencia: e.target.value, vencimento: vencimentoDe(e.target.value, cliente.diaVencimento) })} /></Campo>
        <Campo label="Valor (R$)"><input className={inputClass} inputMode="decimal" value={n.valor} onChange={(e) => setN({ ...n, valor: e.target.value })} /></Campo>
        <Campo label="Vencimento"><input className={inputClass} type="date" value={n.vencimento} onChange={(e) => setN({ ...n, vencimento: e.target.value })} /></Campo>
        <Button type="button" disabled={salvando} onClick={incluir}>Lançar cobrança</Button>
      </div>
      {itens.cobrancas.length === 0 ? <p className="text-sm text-ink/50">Nenhuma cobrança lançada.</p> : (
        <ul className="divide-y divide-line">
          {itens.cobrancas.map((c) => {
            const s = situacao(c, hoje)
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div><p className="font-semibold">{formatarCompetencia(c.competencia)}</p><p className="text-xs text-ink/55">vence {formatarDiaISO(c.vencimento)}{c.pagoEm ? ` · paga em ${formatarDiaISO(c.pagoEm)}` : ''}</p></div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{formatarReais(c.valorCentavos)}</span>
                  <SituacaoSelo s={s} />
                  {c.status === 'pendente'
                    ? <button type="button" disabled={salvando} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-paper" onClick={() => void item(() => marcarCobranca(painel, c.competencia, true, hoje), `Cobrança de ${formatarCompetencia(c.competencia)} marcada como paga.`)}>Marcar paga</button>
                    : <button type="button" disabled={salvando} className="rounded-lg px-2 py-1 text-xs text-ink/50 hover:bg-paper" onClick={() => void item(() => marcarCobranca(painel, c.competencia, false, hoje), 'Pagamento desfeito.')}>Desfazer</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] text-ink/40">Controle manual (sem boleto ou Pix integrados). Uma cobrança por mês; nada é apagado.</p>
    </section>
  )
}

function Visitas({ painel, itens, salvando, item }: { painel: Painel; itens: ItensPainel; salvando: boolean; item: Item }) {
  const [v, setV] = useState({ data: hojeISO(), hora: '10:00', motivo: '' })
  const [erro, setErro] = useState('')
  function incluir() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data) || !/^\d{2}:\d{2}$/.test(v.hora)) { setErro('Informe data e hora.'); return }
    setErro('')
    void item(() => agendarVisita(painel, v), `Visita agendada para ${formatarDiaISO(v.data)} às ${v.hora}.`).then((ok) => ok && setV({ ...v, motivo: '' }))
  }
  return (
    <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Visitas ao box</h2>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_120px_2fr_auto] sm:items-end">
        <Campo label="Data"><input className={inputClass} type="date" value={v.data} onChange={(e) => setV({ ...v, data: e.target.value })} /></Campo>
        <Campo label="Hora"><input className={inputClass} type="time" value={v.hora} onChange={(e) => setV({ ...v, hora: e.target.value })} /></Campo>
        <Campo label="Motivo (aparece para o cliente)"><input className={inputClass} maxLength={200} placeholder="Ex.: retirada de móveis" value={v.motivo} onChange={(e) => setV({ ...v, motivo: e.target.value })} /></Campo>
        <Button type="button" disabled={salvando} onClick={incluir}>Agendar</Button>
      </div>
      {itens.visitas.length === 0 ? <p className="text-sm text-ink/50">Nenhuma visita registrada.</p> : (
        <ul className="divide-y divide-line">
          {itens.visitas.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div><p className="font-semibold">{formatarDiaISO(x.data)} às {x.hora}</p><p className="text-xs text-ink/55">{x.motivo || 'sem motivo informado'} · {ROTULO_VISITA[x.status]}</p></div>
              {x.status === 'agendada' ? (
                <div className="flex gap-1">
                  {(['realizada', 'cancelada'] as const).map((s) => (
                    <button key={s} type="button" disabled={salvando} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-paper"
                      onClick={() => {
                        const acao = s === 'cancelada' ? 'Cancelar' : 'Marcar como realizada'
                        if (!window.confirm(`${acao} a visita de ${formatarDiaISO(x.data)} às ${x.hora}?`)) return
                        void item(() => mudarVisita(painel, x.id, s), `Visita marcada como ${ROTULO_VISITA[s].toLowerCase()}.`)
                      }}>{s === 'cancelada' ? 'Cancelar visita' : 'Marcar realizada'}</button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Recados({ painel, itens, autor, salvando, item }: { painel: Painel; itens: ItensPainel; autor: string; salvando: boolean; item: Item }) {
  const [t, setT] = useState({ texto: '', ia: false, iaModelo: '' })
  const [erro, setErro] = useState('')
  function enviar() {
    const erros = validarRecado(t.texto, t.ia, t.iaModelo)
    if (erros.length) { setErro(erros.join(' ')); return }
    setErro('')
    if (painel.ativo && !window.confirm('Publicar este recado no painel do cliente? Ele ficará visível para quem tem o link.')) return
    void item(() => publicarRecado(painel, { texto: t.texto, autor, geradoPorIA: t.ia, iaModelo: t.iaModelo }), painel.ativo ? 'Recado publicado no link do cliente.' : 'Recado salvo (o link está desativado).').then((ok) => ok && setT({ texto: '', ia: false, iaModelo: '' }))
  }
  return (
    <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Recados para o cliente</h2>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <Campo label="Recado"><textarea className={inputClass} rows={3} maxLength={500} placeholder="Ex.: Portão fechado para manutenção no domingo, das 8h às 12h." value={t.texto} onChange={(e) => setT({ ...t, texto: e.target.value })} /></Campo>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t.ia} onChange={(e) => setT({ ...t, ia: e.target.checked })} /> Texto escrito com ajuda de IA</label>
        {t.ia ? <input className={`${inputClass} max-w-56`} aria-label="Qual IA / modelo" placeholder="Qual IA / modelo" maxLength={80} value={t.iaModelo} onChange={(e) => setT({ ...t, iaModelo: e.target.value })} /> : null}
        <Button type="button" disabled={salvando} onClick={enviar}>Publicar recado</Button>
      </div>
      {itens.recados.length === 0 ? <p className="text-sm text-ink/50">Nenhum recado.</p> : (
        <ol className="space-y-2">
          {itens.recados.map((r) => (
            <li key={r.id} className="rounded-xl border border-line px-3 py-2 text-sm">
              <p className="text-[11px] text-ink/45">{formatarData(r.criadoEmMs)} · {r.autor || 'Equipe'}{r.geradoPorIA ? ` · IA: ${r.iaModelo}` : ''}</p>
              <p className="whitespace-pre-wrap">{r.texto}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="text-[11px] text-ink/40">Recados não são editados nem apagados. O link mostra os {RECADOS_NO_LINK} mais recentes.</p>
    </section>
  )
}
