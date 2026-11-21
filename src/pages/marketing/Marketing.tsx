import { BotaoCsv } from '../../components/BotaoCsv'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Download, ExternalLink, Megaphone, Search, Sparkles } from 'lucide-react'
import { Aviso, Button, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { formatarDia } from '../../lib/format'
import {
  ROTULO_CAMPANHA,
  ROTULO_TIPO,
  TIPOS_MATERIAL,
  categoriasDe,
  filtrarMateriais,
  proximasCampanhas,
  situacaoCampanha,
  vigencia,
  type TipoMaterial,
  type Vigencia,
} from '../../lib/marketing'
import { useVisao } from '../../lib/visao'
import { useMarketing } from './useMarketing'

const ROTULO_VIGENCIA: Record<Vigencia, string> = { vigente: 'Vigente', vencido: 'Vencido', futuro: 'Futuro' }

export function MarketingPage() {
  const dados = useMarketing()
  const { comoFranqueado, simulado } = useVisao()
  const [tipo, setTipo] = useState<TipoMaterial | 'todos'>('todos')
  const [categoria, setCategoria] = useState('')
  const [campanhaId, setCampanhaId] = useState('')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('recentes')
  const [periodo, setPeriodo] = useState<Vigencia>('vigente')
  const agora = Date.now()
  const disponiveis = dados.materiais.filter((m) => m.ativo && (dados.gestor || vigencia(m, agora) === 'vigente'))
  const lista = filtrarMateriais(disponiveis, {
    tipo, categoria, campanhaId, busca, incluirForaDaVigencia: dados.gestor,
    vigencia: dados.gestor ? periodo : 'vigente',
  }, agora)
  if (ordem === 'nome') lista.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
  const tipos = TIPOS_MATERIAL.filter((t) => disponiveis.some((m) => m.tipo === t))
  const categorias = categoriasDe(disponiveis)
  const campanhas = new Map(dados.campanhas.map((c) => [c.id, c]))
  const proximas = proximasCampanhas(dados.campanhas, agora).slice(0, 4)

  if (comoFranqueado && !simulado) return <Aviso>Escolha qual franqueado simular para ver a Central de Marketing dessa unidade.</Aviso>

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Central de Marketing</p>
          <h1 className="text-3xl font-extrabold">Materiais da rede</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/65">
            Artes, logos, templates e peças de campanha aprovados pela franqueadora. Baixe pelo link e siga as regras de uso de cada material.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/marketing/calendario" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:border-ink/30">
            <CalendarDays className="h-4 w-4" aria-hidden="true" /> Calendário
          </Link>
          {dados.participa || dados.gestor ? (
            <Link to="/marketing/pedidos" className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
              <Megaphone className="h-4 w-4" aria-hidden="true" /> {dados.gestor ? 'Pedidos das unidades' : 'Pedir uma peça'}
            </Link>
          ) : null}
          {dados.gestor ? (
            <Link to="/marketing/gestao" className="inline-flex items-center rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold hover:border-ink/30">
              Gestão do marketing
            </Link>
          ) : null}
        </div>
      </header>

      {dados.erro ? <Aviso tom="erro"><p role="alert">{dados.erro}</p><Button type="button" variant="secondary" className="mt-2" onClick={dados.recarregar}>Tentar novamente</Button></Aviso> : null}
      {comoFranqueado ? <Aviso>Simulação: você vê os materiais como {simulado?.nome}, mas não pode pedir peças nem alterar nada nesta visão.</Aviso> : null}
      {dados.gestor ? <Aviso>Aqui você vê o que as unidades veem (ativos e na validade). Materiais inativos, vencidos ou futuros ficam na Gestão.</Aviso> : null}

      {proximas.length ? (
        <section aria-label="Campanhas" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {proximas.map((c) => {
            const situacao = situacaoCampanha(c, agora)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCampanhaId(campanhaId === c.id ? '' : c.id)}
                className={cx('rounded-2xl border bg-white p-4 text-left shadow-sm', campanhaId === c.id ? 'border-brand' : 'border-line hover:border-ink/30')}
                aria-pressed={campanhaId === c.id}
              >
                <Selo tom={situacao === 'em_andamento' ? 'lima' : 'marca'}>{situacao === 'em_andamento' ? 'Agora' : 'Em breve'}</Selo>
                <p className="mt-2 font-bold leading-snug">{c.titulo}</p>
                <p className="text-xs text-ink/55">{ROTULO_CAMPANHA[c.tipo]} · {formatarDia(c.inicioMs)} a {formatarDia(c.fimMs)}</p>
              </button>
            )
          })}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden="true" />
          <input className={cx(inputClass, 'pl-9')} placeholder="Buscar material" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar material" />
        </label>
        {categorias.length ? (
          <select className={cx(inputClass, 'w-auto')} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : null}
        {dados.gestor ? (
          <select className={cx(inputClass, 'w-auto')} value={periodo} onChange={(e) => setPeriodo(e.target.value as Vigencia)} aria-label="Vigência">
            <option value="vigente">Vigentes</option>
            <option value="vencido">Vencidos</option>
            <option value="futuro">Futuros</option>
          </select>
        ) : null}
        <select className={cx(inputClass, 'w-auto')} value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordenar materiais">
          <option value="recentes">Mais recentes</option>
          <option value="nome">Título</option>
        </select>
        {!dados.carregando && !dados.erro && !comoFranqueado && (dados.gestor || dados.participa) ? <BotaoCsv arquivo="materiais-marketing"
          cabecalhos={['Título', 'Tipo', 'Categoria', 'Campanha', 'Formato', 'Validade']}
          linhas={lista.map((m) => [m.titulo, ROTULO_TIPO[m.tipo], m.categoria, campanhas.get(m.campanhaId)?.titulo, m.formato,
            m.validoAteMs ? formatarDia(m.validoAteMs) : 'Sem prazo'])} /> : null}
        {campanhaId ? (
          <button type="button" className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white" onClick={() => setCampanhaId('')}>
            Campanha: {campanhas.get(campanhaId)?.titulo ?? campanhaId} ✕
          </button>
        ) : null}
      </div>
      {tipos.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de material">
          {(['todos', ...tipos] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)} className={tipo === t ? 'rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white' : 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink/60'}>
              {t === 'todos' ? 'Todos' : ROTULO_TIPO[t]}
            </button>
          ))}
        </div>
      ) : null}

      {dados.carregando ? <Carregando texto="Carregando materiais…" /> : null}
      {!dados.carregando && !dados.erro && !lista.length ? <Vazio titulo={disponiveis.length ? 'Nenhum resultado para este filtro' : 'Nenhum material aqui'} texto={disponiveis.length ? 'Ajuste a busca ou os filtros.' : 'Quando a franqueadora publicar artes e campanhas, elas aparecem nesta página.'} /> : null}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((m) => {
          const campanha = m.campanhaId ? campanhas.get(m.campanhaId) : undefined
          return (
            <li key={m.id} className="flex flex-col rounded-2xl border border-line bg-white p-5 shadow-sm">
              {m.previaUrl ? (
                <img src={m.previaUrl} alt={`Prévia de ${m.titulo}`} loading="lazy" referrerPolicy="no-referrer" className="mb-3 aspect-video w-full rounded-xl border border-line object-cover" />
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                <Selo tom="marca">{ROTULO_TIPO[m.tipo]}</Selo>
                {dados.gestor ? <Selo>{ROTULO_VIGENCIA[vigencia(m, agora)]}</Selo> : null}
                {m.categoria ? <Selo>{m.categoria}</Selo> : null}
                {!m.publico ? <Selo tom="alerta">Para a sua unidade</Selo> : null}
              </div>
              <h2 className="mt-2 font-bold leading-snug">{m.titulo}</h2>
              {m.descricao ? <p className="mt-1 text-sm text-ink/65">{m.descricao}</p> : null}
              {campanha ? <p className="mt-2 text-xs text-ink/55">Campanha: {campanha.titulo}</p> : null}
              {m.regrasUso ? <p className="mt-2 rounded-xl bg-paper px-3 py-2 text-xs text-ink/70"><strong>Regras de uso:</strong> {m.regrasUso}</p> : null}
              <p className="mt-2 text-xs text-ink/45">
                {m.formato ? `${m.formato} · ` : ''}
                {m.validoAteMs ? `válido até ${formatarDia(m.validoAteMs)}` : 'sem prazo de validade'}
              </p>
              {m.geradoPorIA ? (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-ink/45"><Sparkles className="h-3 w-3" aria-hidden="true" /> Criado com IA: {m.iaModelo}</p>
              ) : null}
              <a href={m.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
                <Download className="h-4 w-4" aria-hidden="true" /> Abrir / baixar <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              {vigencia(m, agora) !== 'vigente' ? <p className="mt-1 text-xs text-red-700">Fora da validade</p> : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
