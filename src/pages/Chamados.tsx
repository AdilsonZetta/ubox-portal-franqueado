import { normalizar } from '../lib/text'
import { BotaoCsv } from '../components/BotaoCsv'
import { useEffect, useMemo, useState } from 'react'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, inputClass } from '../components/ui'
import {
  CATEGORIAS_CHAMADO,
  PRIORIDADES_CHAMADO,
  STATUS_CHAMADO,
  STATUS_FRANQUEADORA,
  chamadoAtrasado,
  chamadoPendente,
  nomeCategoria,
  nomePrioridade,
  nomeStatus,
  inicioDoPrazo,
  prazoMillis,
  tempoMedioResolucaoHoras,
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
  type Chamado,
  type EventoChamado,
} from '../lib/chamados'
import { listarUsuarios } from '../lib/api'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/errors'
import { formatarData, paraMillis } from '../lib/format'
import { useVisao } from '../lib/visao'

const vazio = { titulo: '', categoria: 'operacao' as CategoriaChamado, prioridade: 'media' as PrioridadeChamado, descricao: '', links: '' }

export function ChamadosPage() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const rede = Boolean(user && (user.papel === 'admin' || user.papel === 'equipe_franqueadora') && !comoFranqueado)
  const unidadeId = rede ? null : pessoa?.unidadeId ?? null
  const [chamados, setChamados] = useState<Chamado[]>([])
  const [erro, setErro] = useState('')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [filtros, setFiltros] = useState({ unidade: '', status: '', categoria: '', prioridade: '' })
  const [busca, setBusca] = useState('')
  const [soAtrasados, setSoAtrasados] = useState(false)
  const [ordem, setOrdem] = useState('recentes')
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(vazio)
  const [abrindo, setAbrindo] = useState(false)

  useEffect(() => {
    if (!user || (!rede && !unidadeId)) return
    setCarregando(true)
    setChamados([])
    setErro('')
    return observarChamados({ rede, unidadeId }, (lista) => {
      setChamados(lista)
      setCarregando(false)
    }, (falha) => {
      setErro(mensagemErro(falha))
      setCarregando(false)
    })
  }, [user, rede, unidadeId])

  const visiveis = useMemo(() => {
    const agora = Date.now()
    const consulta = normalizar(busca.trim())
    return chamados.filter((chamado) => {
      if (filtros.unidade && chamado.unidadeId !== filtros.unidade) return false
      if (filtros.status && chamado.status !== filtros.status) return false
      if (filtros.categoria && chamado.categoria !== filtros.categoria) return false
      if (filtros.prioridade && chamado.prioridade !== filtros.prioridade) return false
      if (soAtrasados && !chamadoAtrasado(chamado.status, paraMillis(chamado.criadoEm), chamado.slaHoras, agora, paraMillis(chamado.reabertoEm))) return false
      return normalizar(`${chamado.titulo} ${chamado.unidadeNome}`).includes(consulta)
    }).sort((a, b) => ordem === 'prazo'
      ? prazoMillis(inicioDoPrazo(paraMillis(a.criadoEm), paraMillis(a.reabertoEm)), a.slaHoras)
        - prazoMillis(inicioDoPrazo(paraMillis(b.criadoEm), paraMillis(b.reabertoEm)), b.slaHoras)
      : paraMillis(b.criadoEm) - paraMillis(a.criadoEm))
  }, [chamados, filtros, busca, soAtrasados, ordem])

  const unidades = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const chamado of chamados) mapa.set(chamado.unidadeId, chamado.unidadeNome)
    return [...mapa.entries()]
  }, [chamados])

  const painel = useMemo(() => {
    const agora = Date.now()
    const abertos = chamados.filter((chamado) => chamadoPendente(chamado.status)).length
    const atrasados = chamados.filter((chamado) => chamadoAtrasado(chamado.status, paraMillis(chamado.criadoEm), chamado.slaHoras, agora, paraMillis(chamado.reabertoEm))).length
    const media = tempoMedioResolucaoHoras(
      chamados.map((chamado) => ({
        status: chamado.status,
        criadoEm: paraMillis(chamado.criadoEm),
        resolvidoEm: paraMillis(chamado.resolvidoEm),
        fechadoEm: paraMillis(chamado.fechadoEm),
      })),
    )
    return { abertos, atrasados, media }
  }, [chamados])

  const atual = visiveis.find((chamado) => chamado.id === selecionado) ?? visiveis[0] ?? null

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
      {comoFranqueado ? <Aviso>Visualização do franqueado. Os botões de ação ficam disponíveis quando você volta para a franqueadora ou entra com a conta da unidade.</Aviso> : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
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
        <Campo label="Buscar chamados"><input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Título ou unidade" /></Campo>
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
        {!carregando ? <BotaoCsv arquivo="chamados" cabecalhos={['Título', 'Unidade', 'Status', 'Categoria', 'Prioridade', 'Abertura']}
          linhas={visiveis.map((c) => [c.titulo, c.unidadeNome, nomeStatus(c.status), nomeCategoria(c.categoria), nomePrioridade(c.prioridade), formatarData(c.criadoEm)])} /> : null}
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
      ) : (
        <form
          className="space-y-3 rounded-2xl border border-line bg-white p-4"
          onSubmit={(evento) => {
            evento.preventDefault()
            if (!user || comoFranqueado) return
            const anexos = form.links.split('\n').map((linha) => linha.trim()).filter(Boolean).map((url) => ({ nome: url, url }))
            if (anexos.some((anexo) => !anexo.url.startsWith('https://'))) {
              setErro('Cada anexo precisa ser um link que começa com https://')
              return
            }
            setErro('')
            setAbrindo(true)
            void abrirChamado(user, { ...form, anexos })
              .then(() => setForm(vazio))
              .catch((falha: unknown) => setErro(mensagemErro(falha)))
              .finally(() => setAbrindo(false))
          }}
        >
          <h2 className="font-bold">Abrir chamado</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo label="Título"><input className={inputClass} required minLength={2} value={form.titulo} onChange={(evento) => setForm({ ...form, titulo: evento.target.value })} /></Campo>
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
          <Button type="submit" disabled={abrindo || comoFranqueado}>{abrindo ? 'Abrindo…' : 'Abrir chamado'}</Button>
        </form>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-2">
          {carregando ? <Carregando texto="Carregando chamados…" /> : null}
          {!carregando && !erro && !visiveis.length ? <Vazio titulo={chamados.length ? 'Nenhum resultado para este filtro' : 'Nenhum chamado'} texto={chamados.length ? 'Ajuste a busca ou os filtros.' : 'Quando um pedido for aberto, ele aparece aqui.'} /> : null}
          {visiveis.map((chamado) => {
            const atrasado = chamadoAtrasado(chamado.status, paraMillis(chamado.criadoEm), chamado.slaHoras, Date.now(), paraMillis(chamado.reabertoEm))
            return (
              <button key={chamado.id} type="button" onClick={() => setSelecionado(chamado.id)} className={`w-full rounded-2xl border bg-white px-4 py-3 text-left ${atual?.id === chamado.id ? 'border-brand' : 'border-line'}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{chamado.titulo}</span>
                  <Selo tom={atrasado ? 'alerta' : 'neutro'}>{atrasado ? 'Atrasado' : nomeStatus(chamado.status)}</Selo>
                  <Selo tom="marca">{nomePrioridade(chamado.prioridade)}</Selo>
                </span>
                <span className="mt-1 block text-xs text-ink/50">
                  {rede ? `${chamado.unidadeNome} · ` : ''}{nomeCategoria(chamado.categoria)} · prazo {formatarData(prazoMillis(inicioDoPrazo(paraMillis(chamado.criadoEm), paraMillis(chamado.reabertoEm)), chamado.slaHoras))}
                </span>
              </button>
            )
          })}
        </div>
        {atual ? <Detalhe chamado={atual} rede={rede} leitura={comoFranqueado} admin={ehAdmin} aoErro={setErro} /> : null}
      </div>
    </div>
  )
}

function Detalhe({ chamado, rede, leitura, admin, aoErro }: { chamado: Chamado; rede: boolean; leitura: boolean; admin: boolean; aoErro: (texto: string) => void }) {
  const { user } = useAuth()
  const [eventos, setEventos] = useState<EventoChamado[]>([])
  const [texto, setTexto] = useState('')
  const [nota, setNota] = useState(5)
  const [equipe, setEquipe] = useState<{ uid: string; nome: string }[]>([])

  useEffect(() => observarEventos(chamado.id, setEventos, (falha) => aoErro(mensagemErro(falha))), [chamado.id, aoErro])

  useEffect(() => {
    if (!admin) return
    void listarUsuarios().then((lista) => {
      setEquipe(lista.filter((pessoa) => pessoa.ativo && (pessoa.papel === 'admin' || pessoa.papel === 'equipe_franqueadora')).map((pessoa) => ({ uid: pessoa.uid, nome: pessoa.nome })))
    }).catch(() => setEquipe([]))
  }, [admin])

  if (!user) return null
  const atrasado = chamadoAtrasado(chamado.status, paraMillis(chamado.criadoEm), chamado.slaHoras, Date.now(), paraMillis(chamado.reabertoEm))
  const podeEncerrar = Boolean(user && (user.papel === 'franqueado' || user.uid === chamado.abertoPor))

  async function agir(promessa: Promise<unknown>) {
    try {
      await promessa
    } catch (falha) {
      aoErro(mensagemErro(falha))
    }
  }

  return (
    <article className="space-y-4 rounded-2xl border border-line bg-white p-4">
      <header>
        <h2 className="text-xl font-extrabold">{chamado.titulo}</h2>
        <p className="mt-1 text-sm text-ink/60">{chamado.unidadeNome} · {nomeCategoria(chamado.categoria)} · {nomePrioridade(chamado.prioridade)} · SLA {chamado.slaHoras} h</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Selo>{nomeStatus(chamado.status)}</Selo>
          {atrasado ? <Selo tom="alerta">Atrasado</Selo> : null}
          {chamado.responsavelNome ? <Selo tom="lima">{chamado.responsavelNome}</Selo> : <Selo>Sem responsável</Selo>}
          {chamado.avaliacao ? <Selo tom="marca">Nota {chamado.avaliacao}</Selo> : null}
        </div>
      </header>
      <p className="whitespace-pre-wrap text-sm">{chamado.descricao}</p>
      {chamado.anexos.length ? (
        <ul className="space-y-1 text-sm">
          {chamado.anexos.map((anexo) => (
            <li key={anexo.url}><a className="font-semibold text-brand" href={anexo.url} target="_blank" rel="noreferrer">{anexo.nome}</a></li>
          ))}
        </ul>
      ) : null}
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
            if (!comentario) return
            setTexto('')
            void agir(comentarChamado(user, chamado.id, comentario))
          }}
        >
          <Campo label="Comentário">
            <textarea className={inputClass} rows={2} value={texto} onChange={(evento) => setTexto(evento.target.value)} />
          </Campo>
          <Button type="submit" variant="secondary">Enviar comentário</Button>
        </form>
      )}
      {!leitura && rede ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void agir(assumirChamado(user, chamado, { uid: user.uid, nome: user.nome }))}>Assumir</Button>
          {admin && equipe.length ? (
            <select
              className={`${inputClass} max-w-xs`}
              value=""
              onChange={(evento) => {
                const pessoa = equipe.find((item) => item.uid === evento.target.value)
                if (pessoa) void agir(assumirChamado(user, chamado, pessoa))
              }}
            >
              <option value="">Atribuir a…</option>
              {equipe.map((pessoa) => <option key={pessoa.uid} value={pessoa.uid}>{pessoa.nome}</option>)}
            </select>
          ) : null}
          <select
            className={`${inputClass} max-w-xs`}
            value={STATUS_FRANQUEADORA.includes(chamado.status) ? chamado.status : ''}
            onChange={(evento) => {
              const status = evento.target.value as StatusChamado
              if (status && status !== chamado.status) void agir(mudarStatus(user, chamado, status))
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
              <Button onClick={() => void agir(mudarStatus(user, chamado, 'fechado', { avaliacao: nota }))}>Fechar e avaliar</Button>
            </>
          ) : null}
          {chamado.status === 'fechado' || chamado.status === 'resolvido' ? (
            <Button variant="secondary" onClick={() => void agir(mudarStatus(user, chamado, 'aberto'))}>Reabrir</Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
