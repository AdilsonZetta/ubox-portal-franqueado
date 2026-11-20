import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, ExternalLink } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Vazio, inputClass } from '../../components/ui'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import {
  MAX_COBRANCAS,
  MAX_RECADOS,
  MAX_VISITAS,
  ROTULO_VISITA,
  centavos,
  formatarCompetencia,
  formatarDiaISO,
  formatarReais,
  hojeISO,
  idCurto,
  incluirCobranca,
  incluirRecado,
  incluirVisita,
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
  type Painel,
} from '../../lib/cliente'
import { atualizarPainel, salvarCliente, trocarLink, type MudancaPainel } from '../../lib/clienteApi'
import { CamposCliente } from './Clientes'
import { RodapeModulo12, SituacaoSelo, diaDe, useClientes } from './partes'

const paraForm = (c: Cliente): ClienteForm => ({
  nome: c.nome, telefone: c.telefone, email: c.email, box: c.box, contratoInicio: diaDe(c.contratoInicioMs), contratoFim: diaDe(c.contratoFimMs),
  valorMensal: (c.valorMensalCentavos / 100).toFixed(2).replace('.', ','), diaVencimento: String(c.diaVencimento), obs: c.obs,
})

export function ClientePage() {
  const { id = '' } = useParams()
  const dados = useClientes()
  const cliente = dados.clientes.find((c) => c.id === id) ?? null
  const painel = cliente ? dados.paineis.get(cliente.id) ?? null : null
  const [ok, setOk] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [edit, setEdit] = useState<ClienteForm | null>(null)

  async function acao(fn: () => Promise<unknown>, msg: string) {
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

  if (!dados.carregando && !dados.participa) return <div className="mx-auto max-w-3xl"><Vazio titulo="Painel do Cliente é da unidade" texto="Só o franqueado e a equipe com o módulo acessam os clientes." /></div>
  if (dados.carregando && !cliente) return <Carregando texto="Carregando o cliente…" />
  if (!cliente || !painel) return <div className="mx-auto max-w-3xl space-y-3"><Vazio titulo="Cliente não encontrado" texto="Ele pode ser de outra unidade ou o link está errado." /><Link className="text-sm font-semibold text-brand-dark" to="/clientes">Voltar aos clientes</Link></div>

  const pessoa = dados.pessoa
  const mudar = (m: MudancaPainel, msg: string) => pessoa ? acao(() => atualizarPainel(painel, m), msg) : Promise.resolve(false)

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
          <Cobrancas painel={painel} cliente={cliente} salvando={salvando} mudar={mudar} />
          <Visitas painel={painel} salvando={salvando} mudar={mudar} />
          <Recados painel={painel} autor={primeiroNomeDe(pessoa?.nome ?? '')} salvando={salvando} mudar={mudar} />
        </div>
        <div className="space-y-5">
          <LinkCard painel={painel} cliente={cliente} salvando={salvando}
            ativar={(ativo) => void mudar({ ativo }, ativo ? 'Link ativado: o cliente já pode abrir.' : 'Link desativado: quem tiver o endereço não vê mais nada.')}
            contato={(contatoUnidade) => void mudar({ contatoUnidade: contatoUnidade.trim().slice(0, 120) }, 'Contato da unidade atualizado no link.')}
            trocar={() => pessoa && void acao(() => trocarLink(pessoa, cliente, painel), 'Link trocado. O endereço antigo deixou de funcionar.')} />
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
                  <Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
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
                    <Button type="button" variant="ghost" disabled={salvando} onClick={() => pessoa && void acao(() => salvarCliente(pessoa, cliente, paraForm(cliente), 'encerrado'), 'Contrato encerrado e link desativado (nada é apagado).')}>Encerrar contrato</Button>
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
      <RodapeModulo12 />
    </div>
  )
}

type Mudar = (m: MudancaPainel, msg: string) => Promise<boolean>

function LinkCard({ painel, cliente, salvando, ativar, contato, trocar }: { painel: Painel; cliente: Cliente; salvando: boolean; ativar: (a: boolean) => void; contato: (c: string) => void; trocar: () => void }) {
  const url = linkPainel(painel.token)
  const [copiado, setCopiado] = useState(false)
  const [c, setC] = useState(painel.contatoUnidade)
  return (
    <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Link do cliente</h2>{painel.ativo ? <span className="rounded-full bg-lime-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-lime-800">Ativo</span> : <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold uppercase text-ink/50">Desativado</span>}</div>
      <p className="text-xs text-ink/55">Sem senha: quem tiver o endereço vê o primeiro nome, o box, o contrato, as cobranças, as visitas e os recados. Envie só para o cliente.</p>
      <p className="break-all rounded-xl bg-paper px-3 py-2 font-mono text-[11px] text-ink/70" data-link-painel>{url}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(url).then(() => setCopiado(true)) }}><Copy className="h-4 w-4" aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar'}</Button>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-paper"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Ver como o cliente</a>
      </div>
      <div className="flex flex-wrap gap-2">
        {painel.ativo
          ? <Button type="button" variant="ghost" disabled={salvando} onClick={() => ativar(false)}>Desativar link</Button>
          : <Button type="button" disabled={salvando || cliente.status === 'encerrado'} onClick={() => ativar(true)}>Ativar link</Button>}
        <Button type="button" variant="ghost" disabled={salvando} onClick={trocar}>Gerar link novo</Button>
      </div>
      <Campo label="Contato da unidade (aparece no link)">
        <div className="flex gap-2"><input className={inputClass} maxLength={120} value={c} onChange={(e) => setC(e.target.value)} /><Button type="button" variant="secondary" disabled={salvando || c === painel.contatoUnidade} onClick={() => contato(c)}>Salvar</Button></div>
      </Campo>
    </section>
  )
}

function Cobrancas({ painel, cliente, salvando, mudar }: { painel: Painel; cliente: Cliente; salvando: boolean; mudar: Mudar }) {
  const hoje = useMemo(() => hojeISO(), [])
  const comp = proximaCompetencia(painel.cobrancas)
  const [n, setN] = useState({ competencia: comp, valor: (cliente.valorMensalCentavos / 100).toFixed(2).replace('.', ','), vencimento: vencimentoDe(comp, cliente.diaVencimento) })
  const [erro, setErro] = useState('')
  const r = resumoCobrancas(painel.cobrancas, hoje)

  function incluir() {
    const erros = validarCobranca(n)
    if (erros.length) { setErro(erros.join(' ')); return }
    const nova = incluirCobranca(painel.cobrancas, { id: idCurto(), competencia: n.competencia, valorCentavos: centavos(n.valor), vencimento: n.vencimento, status: 'pendente', pagoEm: '' })
    if (!nova) { setErro(painel.cobrancas.some((c) => c.competencia === n.competencia) ? 'Já existe cobrança para esse mês.' : `O painel guarda até ${MAX_COBRANCAS} cobranças e todas estão em aberto.`); return }
    setErro('')
    void mudar({ cobrancas: nova }, `Cobrança de ${formatarCompetencia(n.competencia)} lançada.`).then((ok) => {
      if (!ok) return
      const prox = proximaCompetencia(nova)
      setN({ ...n, competencia: prox, vencimento: vencimentoDe(prox, cliente.diaVencimento) })
    })
  }

  return (
    <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Cobranças</h2>
        <p className="text-sm text-ink/60">Em aberto: <b className="tabular-nums">{formatarReais(r.emAbertoCentavos)}</b>{r.atrasadas ? <span className="text-red-700"> · {r.atrasadas} atrasada(s)</span> : null}</p>
      </div>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Campo label="Mês de referência"><input className={inputClass} type="month" value={n.competencia} onChange={(e) => setN({ ...n, competencia: e.target.value, vencimento: vencimentoDe(e.target.value, cliente.diaVencimento) })} /></Campo>
        <Campo label="Valor (R$)"><input className={inputClass} inputMode="decimal" value={n.valor} onChange={(e) => setN({ ...n, valor: e.target.value })} /></Campo>
        <Campo label="Vencimento"><input className={inputClass} type="date" value={n.vencimento} onChange={(e) => setN({ ...n, vencimento: e.target.value })} /></Campo>
        <Button type="button" disabled={salvando} onClick={incluir}>Lançar cobrança</Button>
      </div>
      {painel.cobrancas.length === 0 ? <p className="text-sm text-ink/50">Nenhuma cobrança lançada.</p> : (
        <ul className="divide-y divide-line">
          {painel.cobrancas.map((c) => {
            const s = situacao(c, hoje)
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div><p className="font-semibold">{formatarCompetencia(c.competencia)}</p><p className="text-xs text-ink/55">vence {formatarDiaISO(c.vencimento)}{c.pagoEm ? ` · paga em ${formatarDiaISO(c.pagoEm)}` : ''}</p></div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{formatarReais(c.valorCentavos)}</span>
                  <SituacaoSelo s={s} />
                  {c.status === 'pendente'
                    ? <button type="button" disabled={salvando} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-paper" onClick={() => void mudar({ cobrancas: painel.cobrancas.map((x) => (x.id === c.id ? { ...x, status: 'pago', pagoEm: hoje } : x)) }, `Cobrança de ${formatarCompetencia(c.competencia)} marcada como paga.`)}>Marcar paga</button>
                    : <button type="button" disabled={salvando} className="rounded-lg px-2 py-1 text-xs text-ink/50 hover:bg-paper" onClick={() => void mudar({ cobrancas: painel.cobrancas.map((x) => (x.id === c.id ? { ...x, status: 'pendente', pagoEm: '' } : x)) }, 'Pagamento desfeito.')}>Desfazer</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] text-ink/40">Controle manual (sem boleto ou Pix integrados). O painel guarda as {MAX_COBRANCAS} mais recentes; ao passar disso, sai a paga mais antiga.</p>
    </section>
  )
}

function Visitas({ painel, salvando, mudar }: { painel: Painel; salvando: boolean; mudar: Mudar }) {
  const [v, setV] = useState({ data: hojeISO(), hora: '10:00', motivo: '' })
  const [erro, setErro] = useState('')
  function incluir() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data) || !/^\d{2}:\d{2}$/.test(v.hora)) { setErro('Informe data e hora.'); return }
    const nova = incluirVisita(painel.visitas, { id: idCurto(), data: v.data, hora: v.hora, motivo: v.motivo.trim().slice(0, 200), status: 'agendada' })
    if (!nova) { setErro(`O painel guarda até ${MAX_VISITAS} visitas e todas estão agendadas.`); return }
    setErro('')
    void mudar({ visitas: nova }, `Visita agendada para ${formatarDiaISO(v.data)} às ${v.hora}.`).then((ok) => ok && setV({ ...v, motivo: '' }))
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
      {painel.visitas.length === 0 ? <p className="text-sm text-ink/50">Nenhuma visita registrada.</p> : (
        <ul className="divide-y divide-line">
          {painel.visitas.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div><p className="font-semibold">{formatarDiaISO(x.data)} às {x.hora}</p><p className="text-xs text-ink/55">{x.motivo || 'sem motivo informado'} · {ROTULO_VISITA[x.status]}</p></div>
              {x.status === 'agendada' ? (
                <div className="flex gap-1">
                  {(['realizada', 'cancelada'] as const).map((s) => (
                    <button key={s} type="button" disabled={salvando} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-paper"
                      onClick={() => void mudar({ visitas: painel.visitas.map((y) => (y.id === x.id ? { ...y, status: s } : y)) }, `Visita marcada como ${ROTULO_VISITA[s].toLowerCase()}.`)}>{ROTULO_VISITA[s]}</button>
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

function Recados({ painel, autor, salvando, mudar }: { painel: Painel; autor: string; salvando: boolean; mudar: Mudar }) {
  const [t, setT] = useState({ texto: '', ia: false, iaModelo: '' })
  const [erro, setErro] = useState('')
  function enviar() {
    const erros = validarRecado(t.texto, t.ia, t.iaModelo)
    if (erros.length) { setErro(erros.join(' ')); return }
    setErro('')
    const lista = incluirRecado(painel.recados, { id: idCurto(), texto: t.texto.trim().slice(0, 500), emMs: Date.now(), autor, geradoPorIA: t.ia, iaModelo: t.ia ? t.iaModelo.trim().slice(0, 80) : '' })
    void mudar({ recados: lista }, painel.ativo ? 'Recado publicado no link do cliente.' : 'Recado salvo (o link está desativado).').then((ok) => ok && setT({ texto: '', ia: false, iaModelo: '' }))
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
      {painel.recados.length === 0 ? <p className="text-sm text-ink/50">Nenhum recado.</p> : (
        <ol className="space-y-2">
          {painel.recados.map((r) => (
            <li key={r.id} className="rounded-xl border border-line px-3 py-2 text-sm">
              <p className="text-[11px] text-ink/45">{formatarData(r.emMs)} · {r.autor || 'Equipe'}{r.geradoPorIA ? ` · IA: ${r.iaModelo}` : ''}</p>
              <p className="whitespace-pre-wrap">{r.texto}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="text-[11px] text-ink/40">O link mostra os {MAX_RECADOS} recados mais recentes.</p>
    </section>
  )
}
