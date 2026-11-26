import { normalizar } from '../lib/text'
import { BotaoCsv } from '../components/BotaoCsv'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ConfirmacaoPedido, focarPedido } from '../components/ConfirmacaoPedido'
import { protocoloDe } from '../lib/pedidosUnidade'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, inputClass } from '../components/ui'
import {
  CATEGORIAS_CHAMADO,
  PRIORIDADES_CHAMADO,
  STATUS_CHAMADO,
  STATUS_FRANQUEADORA,
  nomeCategoria,
  nomePrioridade,
  nomeStatus,
  tempoMedioResolucaoHoras,
  type PrazoChamado,
  type CategoriaChamado,
  type PrioridadeChamado,
  type StatusChamado,
} from '../data/chamados'
import {
  abrirChamado,
  assumirChamado,
  comentarChamado,
  mudarStatus,
  observarChamados,
  observarEventos,
  prazoDoChamado,
  type Chamado,
  type EventoChamado,
} from '../lib/chamados'
import { listarUsuarios } from '../lib/api'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/errors'
import { formatarData, paraMillis } from '../lib/format'
import { useVisao } from '../lib/visao'

const filtrosVazios = { unidade: '', status: '', categoria: '', prioridade: '' }
const vazio = { titulo: '', categoria: 'operacao' as CategoriaChamado, prioridade: 'media' as PrioridadeChamado, descricao: '', links: '' }

export function ChamadosPage() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const rede = Boolean(user && (user.papel === 'admin' || user.papel === 'equipe_franqueadora') && !comoFranqueado)
  const unidadeId = rede ? null : pessoa?.unidadeId ?? null
  const [chamados, setChamados] = useState<Chamado[]>([])
  const [erro, setErro] = useState('')
  const [erroCarga, setErroCarga] = useState('')
  const [tique, setTique] = useState(0)
  const [params, setParams] = useSearchParams()
  const alvo = params.get('id')
  const novo = params.get('novo') === '1'
  const [selecionado, setSelecionado] = useState(alvo)
  const [filtros, setFiltros] = useState(filtrosVazios)
  const [busca, setBusca] = useState('')
  const [soAtrasados, setSoAtrasados] = useState(false)
  const [ordem, setOrdem] = useState('recentes')
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(vazio)
  const [abrindo, setAbrindo] = useState(false)
  const [confirmado, setConfirmado] = useState<string | null>(null)
  const tituloRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (alvo) {
      setSelecionado(alvo)
      setFiltros(filtrosVazios)
      setBusca('')
      setSoAtrasados(false)
    }
  }, [alvo])

  useEffect(() => {
    if (novo && !alvo && !confirmado) tituloRef.current?.focus()
  }, [novo, alvo, confirmado, unidadeId])

  useEffect(() => {
    if (!user || (!rede && !unidadeId)) return
    setCarregando(true)
    setChamados([])
    setErroCarga('')
    return observarChamados({ rede, unidadeId }, (lista) => {
      setChamados(lista)
      setCarregando(false)
    }, (falha) => {
      setErroCarga(mensagemErro(falha))
      setCarregando(false)
    })
  }, [user, rede, unidadeId, tique])

  const comPrazo = useMemo(() => {
    const agora = Date.now()
    return chamados.map((chamado) => ({ chamado, prazo: prazoDoChamado(chamado, agora) }))
  }, [chamados])

  const visiveis = useMemo(() => {
    const consulta = normalizar(busca.trim())
    return comPrazo.filter(({ chamado, prazo }) => {
      if (filtros.unidade && chamado.unidadeId !== filtros.unidade) return false
      if (filtros.status && chamado.status !== filtros.status) return false
      if (filtros.categoria && chamado.categoria !== filtros.categoria) return false
      if (filtros.prioridade && chamado.prioridade !== filtros.prioridade) return false
      if (soAtrasados && !prazo.atrasado) return false
      return normalizar(`${chamado.titulo} ${chamado.unidadeNome} ${protocoloDe('chamado', chamado.id)}`).includes(consulta)
    }).sort((a, b) => ordem === 'prazo'
      ? a.prazo.venceEmMs - b.prazo.venceEmMs
      : paraMillis(b.chamado.criadoEm) - paraMillis(a.chamado.criadoEm))
  }, [comPrazo, filtros, busca, soAtrasados, ordem])

  const unidades = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const chamado of chamados) mapa.set(chamado.unidadeId, chamado.unidadeNome)
    return [...mapa.entries()]
  }, [chamados])

  const painel = useMemo(() => {
    const abertos = comPrazo.filter(({ prazo }) => prazo.pendente).length
    const atrasados = comPrazo.filter(({ prazo }) => prazo.atrasado).length
    const media = tempoMedioResolucaoHoras(
      chamados.map((chamado) => ({
        status: chamado.status,
        criadoEm: paraMillis(chamado.criadoEm),
        resolvidoEm: paraMillis(chamado.resolvidoEm),
        fechadoEm: paraMillis(chamado.fechadoEm),
      })),
    )
    return { abertos, atrasados, media }
  }, [chamados, comPrazo])

  const atual = visiveis.find(({ chamado }) => chamado.id === selecionado) ?? visiveis[0] ?? null

  const detalhePronto = Boolean(alvo && selecionado === alvo && atual?.chamado.id === alvo && !carregando && !erroCarga)
  useEffect(() => {
    if (detalhePronto) focarPedido(`chamado-${alvo}`)
  }, [alvo, detalhePronto])

  function acompanhar(id: string) {
    setSelecionado(id)
    setFiltros(filtrosVazios)
    setBusca('')
    setSoAtrasados(false)
    setParams({ id })
    if (alvo === id && detalhePronto) focarPedido(`chamado-${id}`)
  }

  if (!user) return null
  if (comoFranqueado && !simulado) return <Aviso>Escolha qual franqueado simular para ver os chamados dessa unidade.</Aviso>
  if (!rede && !unidadeId) return <Aviso tom="erro">Esta conta não está ligada a uma unidade, então ainda não abre chamados.</Aviso>

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-medium text-ink/50">Chamados e Demandas</p>
        <h1 className="text-2xl font-extrabold">{rede ? 'Fila da rede' : 'Chamados da unidade'}</h1>
        <p className="text-sm text-ink/60">
          {rede ? 'Todas as unidades. Assuma, responda e acompanhe o prazo.' : 'Pedidos da sua unidade para a franqueadora. Anexos entram como link.'}
        </p>
      </header>
      {comoFranqueado ? <Aviso>Simulação: você está vendo os chamados como {simulado?.nome}, mas não pode abrir, comentar ou mudar o status em nome da unidade. Para agir, volte à visão da franqueadora ou entre com a conta da unidade.</Aviso> : null}
      {erroCarga ? <Aviso tom="erro"><p role="alert">{erroCarga}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => setTique((n) => n + 1)}>Tentar novamente</Button></Aviso> : null}
      {rede ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Em aberto</p>
            <p className="mt-1 text-2xl font-extrabold">{painel.abertos}</p>
          </article>
          <article className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Atrasados</p>
            <p className="mt-1 text-2xl font-extrabold">{painel.atrasados}</p>
          </article>
          <article className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Tempo médio de resolução</p>
            <p className="mt-1 text-2xl font-extrabold">{painel.media === null ? '—' : `${painel.media.toFixed(1)} h`}</p>
          </article>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <Campo label="Buscar chamados"><input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Título, unidade ou protocolo" /></Campo>
        <Campo label="Ordenar por">
          <select className={inputClass} value={ordem} onChange={(e) => setOrdem(e.target.value)}>
            <option value="recentes">Mais recentes</option>
            <option value="prazo">Prazo mais próximo</option>
          </select>
        </Campo>
        <Campo label="Status">
          <select className={inputClass} value={filtros.status} onChange={(evento) => setFiltros({ ...filtros, status: evento.target.value })}>
            <option value="">Todos os status</option>
            {STATUS_CHAMADO.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
          </select>
        </Campo>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={soAtrasados} onChange={(e) => setSoAtrasados(e.target.checked)} /> Somente atrasados</label>
        {!carregando && !erroCarga ? <BotaoCsv arquivo="chamados" cabecalhos={['Protocolo', 'Título', 'Unidade', 'Status', 'Categoria', 'Prioridade', 'Abertura']}
          linhas={visiveis.map(({ chamado: c }) => [protocoloDe('chamado', c.id), c.titulo, c.unidadeNome, nomeStatus(c.status), nomeCategoria(c.categoria), nomePrioridade(c.prioridade), formatarData(c.criadoEm)])} /> : null}
      </div>
      {rede ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <select aria-label="Unidade" className={inputClass} value={filtros.unidade} onChange={(evento) => setFiltros({ ...filtros, unidade: evento.target.value })}>
            <option value="">Todas as unidades</option>
            {unidades.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
          <select aria-label="Categoria" className={inputClass} value={filtros.categoria} onChange={(evento) => setFiltros({ ...filtros, categoria: evento.target.value })}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS_CHAMADO.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
          </select>
          <select aria-label="Prioridade" className={inputClass} value={filtros.prioridade} onChange={(evento) => setFiltros({ ...filtros, prioridade: evento.target.value })}>
            <option value="">Todas as prioridades</option>
            {PRIORIDADES_CHAMADO.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
          </select>
        </div>
      ) : confirmado ? (
        <ConfirmacaoPedido titulo="Chamado aberto" protocolo={protocoloDe('chamado', confirmado)}
          situacao={nomeStatus('aberto')} acompanhar={() => acompanhar(confirmado)}>
          <Button type="button" variant="secondary" onClick={() => {
            setConfirmado(null)
            setParams({ novo: '1' }, { replace: true })
          }}>Abrir outro chamado</Button>
        </ConfirmacaoPedido>
      ) : (
        <form
          className="space-y-3 rounded-2xl border border-line bg-white p-4"
          onSubmit={(evento) => {
            evento.preventDefault()
            if (!user || comoFranqueado || abrindo) return
            if (form.titulo.trim().length < 2) {
              setErro('Escreva um título com pelo menos 2 caracteres.')
              return
            }
            if (form.descricao.trim().length < 2) {
              setErro('Descreva o pedido (pelo menos 2 caracteres).')
              return
            }
            const anexos = form.links.split('\n').map((linha) => linha.trim()).filter(Boolean).map((url) => ({ nome: url, url }))
            if (anexos.some((anexo) => !anexo.url.startsWith('https://'))) {
              setErro('Cada anexo precisa ser um link que começa com https://')
              return
            }
            setErro('')
            setAbrindo(true)
            void abrirChamado(user, { ...form, anexos })
              .then((id) => {
                setForm(vazio)
                setConfirmado(id)
              })
              .catch((falha: unknown) => setErro(mensagemErro(falha)))
              .finally(() => setAbrindo(false))
          }}
        >
          <h2 className="font-bold">Abrir chamado</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo label="Título"><input ref={tituloRef} className={inputClass} required minLength={2} value={form.titulo} onChange={(evento) => setForm({ ...form, titulo: evento.target.value })} /></Campo>
            <Campo label="Categoria">
              <select className={inputClass} value={form.categoria} onChange={(evento) => setForm({ ...form, categoria: evento.target.value as CategoriaChamado })}>
                {CATEGORIAS_CHAMADO.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select className={inputClass} value={form.prioridade} onChange={(evento) => setForm({ ...form, prioridade: evento.target.value as PrioridadeChamado })}>
                {PRIORIDADES_CHAMADO.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Descrição"><textarea className={inputClass} required rows={3} value={form.descricao} onChange={(evento) => setForm({ ...form, descricao: evento.target.value })} /></Campo>
          </div>
          <Campo label="Anexos por link" hint="Um https:// por linha. Opcional.">
            <textarea className={inputClass} rows={2} value={form.links} onChange={(evento) => setForm({ ...form, links: evento.target.value })} />
          </Campo>
          {erro ? <Aviso tom="erro"><p role="alert">{erro}</p></Aviso> : null}
          <Button type="submit" disabled={abrindo || comoFranqueado}>{abrindo ? 'Abrindo…' : erro ? 'Tentar abrir novamente' : 'Abrir chamado'}</Button>
        </form>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-2">
          {carregando ? <Carregando texto="Carregando chamados…" /> : null}
          {!carregando && !erroCarga && !visiveis.length ? <Vazio titulo={chamados.length ? 'Nenhum resultado para este filtro' : 'Nenhum chamado'} texto={chamados.length ? 'Ajuste a busca ou os filtros.' : 'Quando um pedido for aberto, ele aparece aqui.'} /> : null}
          {visiveis.map(({ chamado, prazo }) => (
            <button key={chamado.id} type="button" onClick={() => setSelecionado(chamado.id)} className={`w-full rounded-2xl border bg-white px-4 py-3 text-left ${atual?.chamado.id === chamado.id ? 'border-brand' : 'border-line'}`}>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{chamado.titulo}</span>
                <Selo tom={prazo.atrasado ? 'alerta' : 'neutro'}>{prazo.atrasado ? 'Atrasado' : nomeStatus(chamado.status)}</Selo>
                <Selo tom="marca">{nomePrioridade(chamado.prioridade)}</Selo>
              </span>
              <span className="mt-1 block text-xs text-ink/50">
                {rede ? `${chamado.unidadeNome} · ` : ''}{nomeCategoria(chamado.categoria)}
              </span>
              <span className="mt-1 block text-xs text-ink-soft" translate="no">Protocolo {protocoloDe('chamado', chamado.id)}</span>
              <InfoPrazo prazo={prazo} />
            </button>
          ))}
        </div>
        {atual && !erroCarga ? <Detalhe chamado={atual.chamado} prazo={atual.prazo} rede={rede} leitura={comoFranqueado} admin={ehAdmin} /> : null}
      </div>
    </div>
  )
}

function InfoPrazo({ prazo }: { prazo: PrazoChamado }) {
  return (
    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/70">
      <span>Responde agora: {prazo.rotuloQuemResponde}</span>
      <span>Prazo: {formatarData(prazo.venceEmMs)}</span>
      {prazo.pausado ? <Selo>Prazo pausado · aguardando a unidade</Selo> : null}
    </span>
  )
}

function Detalhe({ chamado, prazo, rede, leitura, admin }: { chamado: Chamado; prazo: PrazoChamado; rede: boolean; leitura: boolean; admin: boolean }) {
  const { user } = useAuth()
  const [eventos, setEventos] = useState<EventoChamado[]>([])
  const [texto, setTexto] = useState('')
  const [nota, setNota] = useState(5)
  const [equipe, setEquipe] = useState<{ uid: string; nome: string }[]>([])
  const [erroAcao, setErroAcao] = useState('')
  const [erroEventos, setErroEventos] = useState('')
  const [tiqueEventos, setTiqueEventos] = useState(0)
  const [seloStatus, setSeloStatus] = useState(0)
  const [enviandoComentario, setEnviandoComentario] = useState(false)
  const [agindo, setAgindo] = useState(false)

  useEffect(() => {
    setErroEventos('')
    return observarEventos(chamado.id, setEventos, (falha) => setErroEventos(mensagemErro(falha)))
  }, [chamado.id, tiqueEventos])

  useEffect(() => {
    setErroAcao('')
    setTexto('')
  }, [chamado.id])

  useEffect(() => {
    if (!admin) return
    void listarUsuarios().then((lista) => {
      setEquipe(lista.filter((pessoa) => pessoa.ativo && (pessoa.papel === 'admin' || pessoa.papel === 'equipe_franqueadora')).map((pessoa) => ({ uid: pessoa.uid, nome: pessoa.nome })))
    }).catch(() => setEquipe([]))
  }, [admin])

  if (!user) return null
  const podeEncerrar = Boolean(user && (user.papel === 'franqueado' || user.uid === chamado.abertoPor))

  async function agir(promessa: Promise<unknown>) {
    setAgindo(true)
    setErroAcao('')
    try {
      await promessa
    } catch (falha) {
      setErroAcao(mensagemErro(falha))
    } finally {
      setAgindo(false)
    }
  }

  return (
    <article id={`chamado-${chamado.id}`} tabIndex={-1} className="space-y-4 rounded-2xl border border-line bg-white p-4 focus-visible:outline-2 focus-visible:outline-brand-dark">
      <header>
        <h2 className="text-xl font-extrabold">{chamado.titulo}</h2>
        <p className="mt-1 text-xs text-ink-soft" translate="no">Protocolo {protocoloDe('chamado', chamado.id)}</p>
        <p className="mt-1 text-sm text-ink/60">{chamado.unidadeNome} · {nomeCategoria(chamado.categoria)} · {nomePrioridade(chamado.prioridade)} · SLA {chamado.slaHoras} h</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Selo>{nomeStatus(chamado.status)}</Selo>
          {prazo.atrasado ? <Selo tom="alerta">Atrasado</Selo> : null}
          {chamado.responsavelNome ? <Selo tom="lima">{chamado.responsavelNome}</Selo> : <Selo>Sem responsável</Selo>}
          {chamado.avaliacao ? <Selo tom="marca">Nota {chamado.avaliacao}</Selo> : null}
        </div>
        <InfoPrazo prazo={prazo} />
      </header>
      <p className="whitespace-pre-wrap text-sm">{chamado.descricao}</p>
      {chamado.anexos.length ? (
        <ul className="space-y-1 text-sm">
          {chamado.anexos.map((anexo) => (
            <li key={anexo.url}><a className="font-semibold text-brand" href={anexo.url} target="_blank" rel="noreferrer">{anexo.nome}</a></li>
          ))}
        </ul>
      ) : null}
      {erroEventos ? <Aviso tom="erro"><p role="alert">{erroEventos}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => setTiqueEventos((n) => n + 1)}>Tentar carregar a conversa novamente</Button></Aviso> : null}
      {erroAcao ? <Aviso tom="erro"><p role="alert">{erroAcao}</p></Aviso> : null}
      <ol className="space-y-2 border-l border-line pl-3">
        {eventos.map((evento) => (
          <li key={evento.id}>
            <p className="text-sm">{evento.tipo === 'status' ? `${evento.autorNome} mudou para ${nomeStatus(evento.para)}` : evento.texto}</p>
            <p className="text-[11px] text-ink/45">{evento.autorNome} · {formatarData(evento.criadoEm)}</p>
          </li>
        ))}
      </ol>
      {leitura ? null : (
        <form
          className="space-y-2"
          onSubmit={(evento) => {
            evento.preventDefault()
            const comentario = texto.trim()
            if (!comentario) {
              setErroAcao('Escreva um comentário antes de enviar.')
              return
            }
            if (enviandoComentario || agindo) return
            setEnviandoComentario(true)
            setErroAcao('')
            void comentarChamado(user, chamado.id, comentario)
              .then(() => setTexto(''))
              .catch((falha: unknown) => setErroAcao(mensagemErro(falha)))
              .finally(() => setEnviandoComentario(false))
          }}
        >
          <Campo label="Comentário">
            <textarea className={inputClass} rows={2} value={texto} onChange={(evento) => { setTexto(evento.target.value); if (erroAcao) setErroAcao('') }} />
          </Campo>
          <Button type="submit" variant="secondary" disabled={enviandoComentario || agindo}>{enviandoComentario ? 'Enviando…' : erroAcao && texto.trim() ? 'Tentar enviar novamente' : 'Enviar comentário'}</Button>
        </form>
      )}
      {!leitura && rede ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={agindo} onClick={() => void agir(assumirChamado(user, chamado, { uid: user.uid, nome: user.nome }))}>Assumir</Button>
          {admin && equipe.length ? (
            <select
              className={`${inputClass} max-w-xs`}
              value=""
              onChange={(evento) => {
                const pessoa = equipe.find((item) => item.uid === evento.target.value)
                evento.currentTarget.value = ''
                if (pessoa && window.confirm(`Atribuir este chamado a ${pessoa.nome}?`)) void agir(assumirChamado(user, chamado, pessoa))
              }}
            >
              <option value="">Atribuir a…</option>
              {equipe.map((pessoa) => <option key={pessoa.uid} value={pessoa.uid}>{pessoa.nome}</option>)}
            </select>
          ) : null}
          <select
            key={`${chamado.id}-${chamado.status}-${seloStatus}`}
            className={`${inputClass} max-w-xs`}
            disabled={agindo}
            value={STATUS_FRANQUEADORA.includes(chamado.status) ? chamado.status : ''}
            onChange={(evento) => {
              const status = evento.target.value as StatusChamado
              if (!status || status === chamado.status) return
              const rotulo = nomeStatus(status)
              const ok = window.confirm(
                status === 'resolvido'
                  ? `Marcar este chamado como ${rotulo}? A unidade poderá fechar ou reabrir em seguida.`
                  : `Alterar o status para ${rotulo}?`,
              )
              if (!ok) {
                setSeloStatus((n) => n + 1)
                return
              }
              void agir(mudarStatus(user, chamado, status))
            }}
          >
            {!STATUS_FRANQUEADORA.includes(chamado.status) ? <option value="">Status da franqueadora</option> : null}
            {STATUS_FRANQUEADORA.map((status) => <option key={status} value={status}>{nomeStatus(status)}</option>)}
          </select>
        </div>
      ) : null}
      {!leitura && !rede && podeEncerrar ? (
        <div className="flex flex-wrap items-center gap-2">
          {chamado.status === 'resolvido' ? (
            <>
              <label className="text-sm">Nota
                <select className={`${inputClass} ml-2`} value={nota} onChange={(evento) => setNota(Number(evento.target.value))}>
                  {[1, 2, 3, 4, 5].map((valor) => <option key={valor} value={valor}>{valor}</option>)}
                </select>
              </label>
              <Button disabled={agindo} onClick={() => {
                if (!window.confirm(`Fechar este chamado com a nota ${nota}?`)) return
                void agir(mudarStatus(user, chamado, 'fechado', { avaliacao: nota }))
              }}>Fechar e avaliar</Button>
            </>
          ) : null}
          {chamado.status === 'fechado' || chamado.status === 'resolvido' ? (
            <Button variant="secondary" disabled={agindo} onClick={() => {
              if (!window.confirm('Reabrir este chamado? Ele volta para a fila da franqueadora.')) return
              void agir(mudarStatus(user, chamado, 'aberto'))
            }}>Reabrir</Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
