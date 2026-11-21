import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ExternalLink, Sparkles } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData, formatarDia } from '../../lib/format'
import {
  ROTULO_PECA,
  ROTULO_STATUS,
  TIPOS_PECA,
  acaoDaUnidade,
  validarPedido,
  type PedidoForm,
  type PedidoMkt,
  type StatusPedido,
} from '../../lib/marketing'
import { cancelarPedido, criarPedido, responderPedido } from '../../lib/marketingApi'
import { useVisao } from '../../lib/visao'
import { useMarketing } from './useMarketing'

export const TOM_STATUS: Record<StatusPedido, 'neutro' | 'marca' | 'lima' | 'alerta'> = {
  aberta: 'marca',
  em_producao: 'alerta',
  aguardando_unidade: 'alerta',
  entregue: 'lima',
  cancelada: 'neutro',
}

const vazio: PedidoForm = { titulo: '', tipoPeca: 'post', descricao: '', medidas: '', prazoDesejado: '', referenciaUrl: '', campanhaId: '' }

/** Detalhes de um pedido, comuns à unidade e à franqueadora. */
export function DetalhePedido({ pedido, campanha }: { pedido: PedidoMkt; campanha?: string }) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Selo tom={TOM_STATUS[pedido.status]}>{ROTULO_STATUS[pedido.status]}</Selo>
        <Selo>{ROTULO_PECA[pedido.tipoPeca]}</Selo>
        {pedido.medidas ? <Selo>{pedido.medidas}</Selo> : null}
      </div>
      <h3 className="font-bold">{pedido.titulo}</h3>
      <p className="text-xs text-ink/50">
        {pedido.nome} · {pedido.unidadeNome || 'Unidade'} · pedido em {formatarData(pedido.criadoEmMs)}
        {pedido.prazoDesejadoMs ? ` · para ${formatarDia(pedido.prazoDesejadoMs)}` : ''}
        {campanha ? ` · campanha ${campanha}` : ''}
      </p>
      <p className="whitespace-pre-line text-ink/75">{pedido.descricao}</p>
      {pedido.referenciaUrl ? (
        <a href={pedido.referenciaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark hover:underline">
          Referência <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
      {pedido.resposta ? <p className="rounded-xl bg-paper px-3 py-2 text-ink/75"><strong>Franqueadora{pedido.responsavelNome ? ` (${pedido.responsavelNome})` : ''}:</strong> {pedido.resposta}</p> : null}
      {pedido.complemento ? <p className="rounded-xl bg-paper px-3 py-2 text-ink/75"><strong>Unidade:</strong> {pedido.complemento}</p> : null}
      {pedido.status === 'entregue' && pedido.entregaUrl ? (
        <div className="flex flex-wrap items-center gap-3">
          <a href={pedido.entregaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            Baixar a peça <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <span className="text-xs text-ink/50">Entregue em {formatarData(pedido.entregueEmMs)}</span>
          {pedido.geradoPorIA ? <span className="flex items-center gap-1 text-[11px] text-ink/45"><Sparkles className="h-3 w-3" aria-hidden="true" /> Criada com IA: {pedido.iaModelo}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

export function PedidosMarketingPage() {
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const dados = useMarketing({ pedidos: true })
  const [form, setForm] = useState<PedidoForm>(vazio)
  const [abrindo, setAbrindo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const campanhas = new Map(dados.campanhas.map((c) => [c.id, c.titulo]))

  if (!user) return null
  if (dados.gestor) return <Navigate to="/marketing/gestao?aba=pedidos" replace />
  if (comoFranqueado) return <Aviso>Na simulação os pedidos não ficam visíveis; eles aparecem na Gestão do marketing.</Aviso>
  if (!dados.participa) return <Aviso>Os pedidos de peça são feitos pelas unidades.</Aviso>

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!user || salvando) return
    const erros = validarPedido(form)
    if (erros.length) {
      setErro(erros.join(' '))
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await criarPedido(user, form)
      setForm(vazio)
      setAbrindo(false)
      setOk('Pedido enviado. A franqueadora acompanha por aqui e você vê cada mudança de status.')
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  async function agir(pedido: PedidoMkt) {
    if (salvando) return
    setErro('')
    setOk('')
    setSalvando(true)
    try {
      if (acaoDaUnidade(pedido.status) === 'cancelar') {
        if (!window.confirm('Cancelar este pedido?')) return
        await cancelarPedido(pedido.id)
        setOk('Pedido cancelado.')
      } else {
        const texto = (respostas[pedido.id] ?? '').trim()
        if (texto.length < 2) {
          setErro('Escreva a resposta para a franqueadora.')
          return
        }
        if (texto === pedido.complemento) {
          setErro('A resposta é igual à anterior. Escreva o que mudou.')
          return
        }
        await responderPedido(pedido.id, texto)
        setOk('Resposta enviada. O pedido voltou para a fila da franqueadora.')
      }
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="text-sm text-ink/50">
        <Link to="/marketing">Central de Marketing</Link> / Pedidos de peça
      </p>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Pedidos de peça</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/65">
            Precisa de uma arte personalizada para a unidade? Peça aqui e acompanhe o andamento. {user.papel === 'franqueado' ? 'Você vê os pedidos de toda a unidade.' : 'Você vê os seus pedidos.'}
          </p>
        </div>
        {!abrindo ? <Button type="button" onClick={() => setAbrindo(true)}>Novo pedido</Button> : null}
      </header>
      {dados.erro ? <Aviso tom="erro"><p role="alert">{dados.erro}</p><Button type="button" variant="secondary" className="mt-2" onClick={dados.recarregar}>Tentar novamente</Button></Aviso> : null}
      {erro ? <Aviso tom="erro"><p role="alert">{erro}</p></Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}

      {abrindo ? (
        <form onSubmit={(e) => void enviar(e)} className="space-y-4 rounded-3xl border border-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Novo pedido</h2>
          <Campo label="O que você precisa">
            <input className={inputClass} maxLength={120} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Post de inauguração da unidade" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo label="Tipo de peça">
              <select className={inputClass} value={form.tipoPeca} onChange={(e) => setForm({ ...form, tipoPeca: e.target.value as PedidoForm['tipoPeca'] })}>
                {TIPOS_PECA.map((t) => <option key={t} value={t}>{ROTULO_PECA[t]}</option>)}
              </select>
            </Campo>
            <Campo label="Medidas / formato">
              <input className={inputClass} maxLength={120} value={form.medidas} onChange={(e) => setForm({ ...form, medidas: e.target.value })} placeholder="Ex.: 1080x1350" />
            </Campo>
            <Campo label="Para quando">
              <input type="date" className={inputClass} value={form.prazoDesejado} onChange={(e) => setForm({ ...form, prazoDesejado: e.target.value })} />
            </Campo>
          </div>
          <Campo label="Descrição" hint="Texto que deve aparecer, público, tom, o que não pode faltar.">
            <textarea className={inputClass} rows={4} maxLength={2000} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Link de referência (opcional)" hint="Drive, Instagram ou site; começa com https://">
              <input className={inputClass} value={form.referenciaUrl} onChange={(e) => setForm({ ...form, referenciaUrl: e.target.value })} placeholder="https://" />
            </Campo>
            <Campo label="Campanha (opcional)">
              <select className={inputClass} value={form.campanhaId} onChange={(e) => setForm({ ...form, campanhaId: e.target.value })}>
                <option value="">Nenhuma</option>
                {dados.campanhas.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
              </select>
            </Campo>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={salvando}>{salvando ? 'Enviando…' : erro ? 'Tentar enviar novamente' : 'Enviar pedido'}</Button>
            <Button type="button" variant="secondary" onClick={() => setAbrindo(false)}>Cancelar</Button>
          </div>
        </form>
      ) : null}

      {dados.carregando ? <Carregando texto="Carregando pedidos…" /> : null}
      {!dados.carregando && !dados.erro && !dados.pedidos.length ? <Vazio titulo="Nenhum pedido ainda" texto="Quando você pedir uma peça, o andamento aparece aqui." /> : null}
      <ul className="space-y-3">
        {dados.pedidos.map((p) => {
          const acao = acaoDaUnidade(p.status)
          const podeAgir = acao && (p.uid === user.uid || user.papel === 'franqueado')
          return (
            <li key={p.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <DetalhePedido pedido={p} campanha={campanhas.get(p.campanhaId)} />
              {podeAgir && acao === 'responder' ? (
                <div className="mt-3 space-y-2">
                  <textarea className={inputClass} rows={2} maxLength={2000} placeholder="Responda à franqueadora" value={respostas[p.id] ?? ''} onChange={(e) => setRespostas({ ...respostas, [p.id]: e.target.value })} aria-label="Resposta para a franqueadora" />
                  <Button type="button" disabled={salvando} onClick={() => void agir(p)}>{salvando ? 'Enviando…' : 'Responder'}</Button>
                </div>
              ) : null}
              {podeAgir && acao === 'cancelar' ? (
                <Button type="button" variant="danger" className="mt-3" disabled={salvando} onClick={() => void agir(p)}>Cancelar pedido</Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
