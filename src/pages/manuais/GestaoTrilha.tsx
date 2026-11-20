import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Plus, Sparkles } from 'lucide-react'
import { Aviso, Button, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { paraMillis, rotuloExibicao, tipoExibicao } from '../../lib/format'
import { listarProgressoVisivel, listarTrilhaManuais, salvarTrilhaManuais, type ItemTrilhaEdicao } from '../../lib/manuaisApi'
import {
  formatarDuracao,
  limitarTempo,
  ordenarTrilha,
  podeGerirTrilha,
  resumirProgresso,
  tempoSugeridoSeg,
  type ProgressoManual,
} from '../../lib/manuaisTrilha'
import { usePortal } from '../../lib/portal'
import { useVisao } from '../../lib/visao'

type Aba = 'ordem' | 'progresso'

export function GestaoTrilhaPage() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado } = useVisao()
  const portal = usePortal()
  const [aba, setAba] = useState<Aba>('ordem')
  const [itens, setItens] = useState<ItemTrilhaEdicao[]>([])
  const [progressos, setProgressos] = useState<ProgressoManual[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [alterado, setAlterado] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [novoId, setNovoId] = useState('')
  const [unidadeFiltro, setUnidadeFiltro] = useState('')
  const permitido = podeGerirTrilha(user, ehAdmin) && !comoFranqueado

  useEffect(() => {
    if (!user || !permitido) return
    let ativo = true
    setCarregando(true)
    void Promise.all([listarTrilhaManuais(), listarProgressoVisivel(user)])
      .then(([trilha, lista]) => {
        if (!ativo) return
        setItens(
          ordenarTrilha(trilha).map((i) => ({
            documentoId: i.documentoId,
            titulo: i.titulo,
            etapa: i.etapa,
            tempoMinimoSeg: i.tempoMinimoSeg,
            videoMinutos: i.videoMinutos,
            ativo: i.ativo,
          })),
        )
        setProgressos(lista)
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, permitido])

  const publicados = useMemo(() => portal.documentos.filter((d) => d.status === 'publicado'), [portal.documentos])
  const porId = useMemo(() => new Map(portal.documentos.map((d) => [d.id, d])), [portal.documentos])
  const foraDaTrilha = publicados.filter((d) => !itens.some((i) => i.documentoId === d.id))
  const ativos = itens.filter((i) => i.ativo)
  const resumo = useMemo(
    () => resumirProgresso(
      itens.map((i) => ({ documentoId: i.documentoId, titulo: i.titulo, ativo: i.ativo })),
      progressos.map((p) => ({ ...p, concluidoMs: paraMillis(p.concluidoEm) })),
    ),
    [itens, progressos],
  )
  const unidadesVisiveis = unidadeFiltro ? resumo.filter((u) => u.unidadeId === unidadeFiltro) : resumo

  if (!user) return null
  if (!permitido) return <Navigate to="/manuais/trilha" replace />

  function mudar(indice: number, patch: Partial<ItemTrilhaEdicao>) {
    setItens((atual) => atual.map((item, i) => (i === indice ? { ...item, ...patch } : item)))
    setAlterado(true)
    setOk('')
  }

  function mover(indice: number, delta: number) {
    setItens((atual) => {
      const destino = indice + delta
      if (destino < 0 || destino >= atual.length) return atual
      const copia = [...atual]
      const [item] = copia.splice(indice, 1)
      copia.splice(destino, 0, item)
      return copia
    })
    setAlterado(true)
    setOk('')
  }

  function sugerido(item: ItemTrilhaEdicao): number {
    const documento = porId.get(item.documentoId)
    return tempoSugeridoSeg(documento?.conteudoTexto ?? '', item.videoMinutos)
  }

  function adicionar() {
    const documento = porId.get(novoId)
    if (!documento) return
    const ultimaEtapa = itens.length ? itens[itens.length - 1].etapa : 'Etapa 1'
    setItens((atual) => [
      ...atual,
      {
        documentoId: documento.id,
        titulo: documento.titulo,
        etapa: ultimaEtapa,
        videoMinutos: 0,
        tempoMinimoSeg: tempoSugeridoSeg(documento.conteudoTexto, 0),
        ativo: true,
      },
    ])
    setNovoId('')
    setAlterado(true)
    setOk('')
  }

  async function salvar() {
    if (!user) return
    setSalvando(true)
    setErro('')
    setOk('')
    try {
      await salvarTrilhaManuais(user, itens)
      setAlterado(false)
      setOk('Trilha salva. As unidades já veem a nova ordem e os novos tempos.')
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="cabecalho-pagina flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Manuais e Processos · Franqueadora</p>
          <h1 className="text-2xl font-bold text-ink">Gestão da trilha de manuais</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Defina a ordem em que os manuais abrem para as unidades e o tempo mínimo de cada um. Acompanhe quem já concluiu.
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Seções da gestão">
          {(['ordem', 'progresso'] as Aba[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={aba === item}
              onClick={() => setAba(item)}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', aba === item ? 'bg-ink text-white' : 'text-muted hover:text-ink')}
            >
              {item === 'ordem' ? 'Ordem e tempo' : 'Progresso'}
            </button>
          ))}
        </div>
      </header>

      <nav aria-label="Gestão da biblioteca" className="flex flex-wrap gap-2">
        <Link to="/admin/documento/novo" className="rounded-xl bg-brand-dark px-3 py-2 text-sm font-semibold text-white">
          Novo documento
        </Link>
        <Link to="/biblioteca" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold">
          Editar na biblioteca
        </Link>
        <Link to="/admin/categorias" className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold">
          Gerenciar categorias
        </Link>
      </nav>

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {carregando ? <Carregando texto="Carregando a trilha…" /> : null}

      {!carregando && aba === 'ordem' ? (
        <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
          <div className="flex flex-col gap-3 border-b border-line p-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink">Ordem e tempo mínimo</h2>
              <p className="text-xs text-muted">
                {ativos.length} {ativos.length === 1 ? 'manual ativo' : 'manuais ativos'} · tempo total{' '}
                {formatarDuracao(ativos.reduce((soma, i) => soma + i.tempoMinimoSeg, 0))}. O sugerido soma a leitura (200 palavras por minuto) e o vídeo.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-ink/70" htmlFor="novo-manual">
                Adicionar manual
                <select id="novo-manual" className={cx(inputClass, 'mt-1 w-72 py-2 text-xs')} value={novoId} onChange={(e) => setNovoId(e.target.value)}>
                  <option value="">Escolha um documento publicado…</option>
                  {foraDaTrilha.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.titulo} · {rotuloExibicao(tipoExibicao(d))}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="button" variant="secondary" onClick={adicionar} disabled={!novoId}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar
              </Button>
              <Button type="button" onClick={() => void salvar()} disabled={!alterado || salvando}>
                {salvando ? 'Salvando…' : 'Salvar trilha'}
              </Button>
            </div>
          </div>

          {!itens.length ? (
            <div className="p-6">
              <Vazio titulo="Trilha vazia" texto="Adicione os manuais na ordem em que as unidades devem estudar." />
            </div>
          ) : (
            <ol className="divide-y divide-line">
              {itens.map((item, indice) => {
                const sugestao = sugerido(item)
                const semDocumento = !porId.has(item.documentoId)
                return (
                  <li key={item.documentoId} className={cx('grid gap-3 px-5 py-4 lg:grid-cols-[auto_minmax(0,1fr)_12rem_7rem_13rem_auto] lg:items-center', !item.ativo && 'bg-paper/50')}>
                    <div className="flex items-center gap-1">
                      <span className="w-7 text-center text-sm font-bold text-muted">{indice + 1}</span>
                      <button type="button" onClick={() => mover(indice, -1)} disabled={indice === 0} className="rounded-lg p-1.5 text-muted hover:bg-paper disabled:opacity-30" aria-label={`Subir ${item.titulo}`}>
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => mover(indice, 1)} disabled={indice === itens.length - 1} className="rounded-lg p-1.5 text-muted hover:bg-paper disabled:opacity-30" aria-label={`Descer ${item.titulo}`}>
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{item.titulo}</p>
                      {porId.has(item.documentoId) ? (
                        <Link to={`/admin/documento/${item.documentoId}`} className="text-xs font-semibold text-brand-dark" aria-label={`Editar ${item.titulo}`}>
                          Editar
                        </Link>
                      ) : null}
                      {semDocumento ? <p className="text-xs text-red-700">Documento não encontrado ou sem permissão de leitura.</p> : null}
                    </div>
                    <label className="text-xs text-muted">
                      Etapa
                      <input className={cx(inputClass, 'mt-1 py-1.5 text-xs')} maxLength={80} value={item.etapa} onChange={(e) => mudar(indice, { etapa: e.target.value })} />
                    </label>
                    <label className="text-xs text-muted">
                      Vídeo (min)
                      <input
                        type="number"
                        min={0}
                        max={600}
                        className={cx(inputClass, 'mt-1 w-full py-1.5 text-xs')}
                        value={item.videoMinutos}
                        onChange={(e) => mudar(indice, { videoMinutos: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })}
                      />
                    </label>
                    <div className="text-xs text-muted">
                      <label htmlFor={`tempo-${item.documentoId}`}>Tempo mínimo (min)</label>
                      <div className="mt-1 flex items-center gap-1.5">
                        <input
                          id={`tempo-${item.documentoId}`}
                          type="number"
                          min={0.5}
                          max={240}
                          step={0.5}
                          className={cx(inputClass, 'w-20 py-1.5 text-xs')}
                          value={Math.round((item.tempoMinimoSeg / 60) * 10) / 10}
                          onChange={(e) => mudar(indice, { tempoMinimoSeg: limitarTempo((Number(e.target.value) || 0) * 60) })}
                        />
                        {sugestao !== item.tempoMinimoSeg ? (
                          <button
                            type="button"
                            onClick={() => mudar(indice, { tempoMinimoSeg: sugestao })}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-dark hover:bg-brand/10"
                            title="Usar o tempo sugerido"
                          >
                            <Sparkles className="h-3 w-3" aria-hidden="true" /> {formatarDuracao(sugestao)}
                          </button>
                        ) : (
                          <Selo tom="lima">Sugerido</Selo>
                        )}
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-ink/70">
                      <input type="checkbox" className="h-4 w-4 accent-brand" checked={item.ativo} onChange={(e) => mudar(indice, { ativo: e.target.checked })} />
                      Ativo
                    </label>
                  </li>
                )
              })}
            </ol>
          )}
          {alterado ? <p className="border-t border-line bg-amber-50 px-5 py-2 text-xs text-amber-900">Há mudanças não salvas.</p> : null}
        </section>
      ) : null}

      {!carregando && aba === 'progresso' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-muted">
              {resumo.length} unidade{resumo.length === 1 ? '' : 's'} com alguém na trilha · {ativos.length} manuais ativos. Pessoas que ainda não abriram nenhum manual não aparecem.
            </p>
            <label className="text-xs font-medium text-ink/70" htmlFor="filtro-unidade">
              Unidade
              <select id="filtro-unidade" className={cx(inputClass, 'mt-1 w-60 py-2 text-xs')} value={unidadeFiltro} onChange={(e) => setUnidadeFiltro(e.target.value)}>
                <option value="">Todas as unidades</option>
                {resumo.map((u) => (
                  <option key={u.unidadeId} value={u.unidadeId}>
                    {u.unidadeNome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!unidadesVisiveis.length ? <Vazio titulo="Ninguém começou a trilha ainda" texto="Assim que alguém de uma unidade abrir o primeiro manual, o progresso aparece aqui." /> : null}
          {unidadesVisiveis.map((unidade) => (
            <article key={unidade.unidadeId} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
              <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-ink">{unidade.unidadeNome}</h2>
                  <p className="text-xs text-muted">
                    {unidade.pessoas.length} pessoa{unidade.pessoas.length === 1 ? '' : 's'} · {unidade.concluidos} de {unidade.possiveis} manuais concluídos
                  </p>
                </div>
                <div className="w-48">
                  <div className="flex justify-between text-xs font-semibold text-muted">
                    <span>Unidade</span>
                    <span>{unidade.percentual}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={unidade.percentual} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${unidade.unidadeNome}`}>
                    <div className="h-full rounded-full bg-lime" style={{ width: `${unidade.percentual}%` }} />
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper/60 text-[11px] font-bold uppercase tracking-wider text-muted">
                      <th className="px-5 py-3">Pessoa</th>
                      <th className="px-4 py-3">Concluídos</th>
                      <th className="px-4 py-3">Último concluído</th>
                      <th className="px-5 py-3 text-right">Reinícios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unidade.pessoas.map((p) => (
                      <tr key={p.uid} className="border-b border-line last:border-0">
                        <td className="px-5 py-3 font-medium">{p.nome}</td>
                        <td className="px-4 py-3">
                          {p.concluidos} / {p.total}
                          {p.total && p.concluidos === p.total ? <span className="ml-2"><Selo tom="lima">Completa</Selo></span> : null}
                        </td>
                        <td className="px-4 py-3 text-muted">{p.ultimoConcluido || '—'}</td>
                        <td className="px-5 py-3 text-right text-muted">{p.reinicios}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <p className="text-center text-[11px] text-muted">Módulo 4 construído e revisado pelo Grok Bot no Cursor (o Antigravity estava sem cota nesta rodada).</p>
    </div>
  )
}
