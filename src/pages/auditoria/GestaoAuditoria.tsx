import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ClipboardPlus, Plus, Trash2 } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, LinkBotao, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarDia } from '../../lib/format'
import { PESO_MAX, novoItemId } from '../../lib/checklist'
import {
  MAX_ITENS_AUD,
  STATUS_ACAO,
  STATUS_AUDITORIA,
  ROTULO_STATUS_ACAO,
  ROTULO_STATUS_AUD,
  podeGerirAuditoria,
  resumoAcoes,
  validarModeloAuditoria,
  type AcaoAuditoria,
  type Auditoria,
  type ModeloAuditoria,
  type ModeloAuditoriaForm,
  type StatusAcao,
  type StatusAuditoria,
} from '../../lib/auditoria'
import { decidirAcao, listarAcoes, listarAuditorias, listarModelosAud, salvarModeloAud } from '../../lib/auditoriaApi'
import { useVisao } from '../../lib/visao'
import { LinkEvidencia } from '../checklist/partes'
import { ListaAuditorias, StatusAcaoSelo } from './partes'

type Aba = 'auditorias' | 'modelos' | 'acoes'
const ROTULO_ABA: Record<Aba, string> = { auditorias: 'Auditorias', modelos: 'Modelos', acoes: 'Planos de ação' }

const formVazio = (): ModeloAuditoriaForm => ({
  titulo: '', descricao: '', notaMinima: 80, ativo: true, geradoPorIA: false, iaModelo: '',
  itens: [{ id: 'a1', texto: '', secao: '', peso: 1 }],
})

export function useGestaoAuditoria() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado } = useVisao()
  const gestor = podeGerirAuditoria(user, ehAdmin) && !comoFranqueado
  const [auditorias, setAuditorias] = useState<Auditoria[]>([])
  const [modelos, setModelos] = useState<ModeloAuditoria[]>([])
  const [acoes, setAcoes] = useState<AcaoAuditoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])
  useEffect(() => {
    if (!gestor) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    setErro('')
    void Promise.all([listarAuditorias(true, null), listarModelosAud(), listarAcoes(true, null)])
      .then(([a, m, ac]) => {
        if (!ativo) return
        setAuditorias(a)
        setModelos(m)
        setAcoes(ac)
        setErro('')
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [gestor, tique])
  return { gestor, ehAdmin, auditorias, modelos, acoes, carregando, erro, recarregar }
}

export function GestaoAuditoriaPage() {
  const { user } = useAuth()
  const dados = useGestaoAuditoria()
  const [params, setParams] = useSearchParams()
  const aba = (Object.keys(ROTULO_ABA).includes(params.get('aba') ?? '') ? params.get('aba') : 'auditorias') as Aba
  const [filtroStatus, setFiltroStatus] = useState<StatusAuditoria | ''>('')
  const [filtroUnidade, setFiltroUnidade] = useState('')
  const [filtroAcao, setFiltroAcao] = useState<StatusAcao | ''>('concluida_unidade')
  const [editando, setEditando] = useState<ModeloAuditoria | null>(null)
  const [form, setForm] = useState<ModeloAuditoriaForm | null>(null)
  const gravacaoEmCurso = useRef(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [comentarios, setComentarios] = useState<Record<string, string>>({})

  if (!user) return null
  if (!dados.gestor) return <Navigate to="/" replace />

  const unidades = [...new Map(dados.auditorias.map((a) => [a.unidadeId, a.unidadeNome || a.unidadeId])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  const auditorias = dados.auditorias.filter((a) => (!filtroStatus || a.status === filtroStatus) && (!filtroUnidade || a.unidadeId === filtroUnidade))
  const assinadas = dados.auditorias.filter((a) => a.status !== 'rascunho')
  const aprovadas = assinadas.filter((a) => a.resultado === 'aprovada').length
  const resumo = resumoAcoes(dados.acoes, Date.now())
  const acoes = dados.acoes.filter((a) => !filtroAcao || a.status === filtroAcao)
  const nomeUnidade = new Map(dados.auditorias.map((a) => [a.unidadeId, a.unidadeNome]))

  function mudarItem(i: number, parte: Partial<ModeloAuditoriaForm['itens'][number]>) {
    if (!form) return
    setForm({ ...form, itens: form.itens.map((it, j) => (j === i ? { ...it, ...parte } : it)) })
  }
  function moverItem(i: number, delta: number) {
    if (!form) return
    const j = i + delta
    if (j < 0 || j >= form.itens.length) return
    const itens = [...form.itens]
    ;[itens[i], itens[j]] = [itens[j], itens[i]]
    setForm({ ...form, itens })
  }

  async function gravar() {
    if (gravacaoEmCurso.current || dados.carregando) return
    if (!user || !form) return
    const erros = validarModeloAuditoria(form)
    if (erros.length) {
      setErro(erros.join(' '))
      return
    }
    setErro('')
    gravacaoEmCurso.current = true
    setSalvando(true)
    setOk('')
    try {
      await salvarModeloAud(user, editando, form)
      setOk(editando ? 'Modelo atualizado. Se itens, pesos ou título mudaram, a versão subiu; auditorias antigas guardam a versão usada.' : 'Modelo de auditoria criado.')
      setForm(null)
      setEditando(null)
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      gravacaoEmCurso.current = false
      setSalvando(false)
    }
  }

  async function decidir(acao: AcaoAuditoria, status: 'validada' | 'reaberta') {
    if (gravacaoEmCurso.current || dados.carregando) return
    if (!user) return
    const comentario = comentarios[acao.id] ?? ''
    if (status === 'reaberta' && comentario.trim().length < 2) {
      setErro('Para reabrir, explique à unidade o que falta.')
      return
    }
    setErro('')
    if (!window.confirm(status === 'validada' ? 'Validar esta ação e encerrar a pendência?' : 'Reabrir esta ação para a unidade?')) return
    gravacaoEmCurso.current = true
    setSalvando(true)
    setOk('')
    try {
      await decidirAcao(user, acao.id, status, comentario)
      setOk(status === 'validada' ? 'Ação validada.' : 'Ação reaberta para a unidade.')
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      gravacaoEmCurso.current = false
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Auditoria e Qualidade · Franqueadora</p>
          <h1 className="text-2xl font-black text-ink">Auditorias da rede</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-ink/65">Audite as unidades (visita, presencial ou remota), assine o resultado, colha a ciência do franqueado e acompanhe o plano de ação de cada não conformidade.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LinkBotao to="/auditoria/nova"><ClipboardPlus className="h-4 w-4" aria-hidden="true" /> Nova auditoria</LinkBotao>
          <div className="flex flex-wrap rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Seções da auditoria">
            {(Object.keys(ROTULO_ABA) as Aba[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={aba === item}
                onClick={() => { setParams({ aba: item }); setErro(''); setOk('') }}
                className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', aba === item ? 'bg-ink text-white' : 'text-ink/60 hover:text-ink')}
              >
                {ROTULO_ABA[item]}
              </button>
            ))}
          </div>
        </div>
      </header>

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {dados.erro ? <Aviso tom="erro"><span role="alert">{dados.erro}</span> <Button variant="ghost" onClick={dados.recarregar}>Tentar novamente</Button></Aviso> : null}
      {dados.carregando ? <Carregando texto="Carregando auditorias…" /> : null}

      {aba === 'auditorias' && !dados.carregando && !dados.erro ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Indicador rotulo="Assinadas" valor={assinadas.length} />
            <Indicador rotulo="Aprovadas" valor={aprovadas} />
            <Indicador rotulo="Aguardando ciência" valor={dados.auditorias.filter((a) => a.status === 'aguardando_ciencia').length} />
            <Indicador rotulo="Rascunhos" valor={dados.auditorias.filter((a) => a.status === 'rascunho').length} />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Situação</span>
              <select className={inputClass} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusAuditoria | '')}>
                <option value="">Todas</option>
                {STATUS_AUDITORIA.map((s) => <option key={s} value={s}>{ROTULO_STATUS_AUD[s]}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Unidade</span>
              <select className={inputClass} value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
                <option value="">Todas</option>
                {unidades.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
              </select>
            </label>
          </div>
          <ListaAuditorias auditorias={auditorias} mostrarUnidade vazio="Crie a primeira auditoria em “Nova auditoria”. Antes, monte um modelo na aba Modelos." />
        </section>
      ) : null}

      {aba === 'modelos' && !dados.carregando && !dados.erro ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_32rem]">
          <section className="space-y-2">
            <Button type="button" variant="secondary" onClick={() => { setEditando(null); setForm(formVazio()); setOk('') }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo modelo
            </Button>
            {!dados.modelos.length ? <Vazio titulo="Nenhum modelo ainda" texto="Monte o roteiro da auditoria: seções, itens e peso de cada item." /> : null}
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {[...dados.modelos].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.titulo.localeCompare(b.titulo, 'pt-BR')).map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => { setEditando(m); setForm({ titulo: m.titulo, descricao: m.descricao, notaMinima: m.notaMinima, ativo: m.ativo, geradoPorIA: m.geradoPorIA, iaModelo: m.iaModelo, itens: m.itens.map((i) => ({ ...i })) }); setOk('') }}
                    className={cx('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper', editando?.id === m.id && 'bg-paper')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.titulo}</span>
                      <span className="text-xs text-ink/45">{m.totalItens} itens · peso {m.pesoTotal} · nota mínima {m.notaMinima}% · v{m.versao}{m.geradoPorIA ? ` · IA: ${m.iaModelo}` : ''}</span>
                    </span>
                    {m.ativo ? <Selo tom="lima">Ativo</Selo> : <Selo>Inativo</Selo>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {form ? (
            <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">{editando ? `Editar modelo (v${editando.versao})` : 'Novo modelo de auditoria'}</h2>
              <Campo label="Título"><input className={inputClass} maxLength={120} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></Campo>
              <Campo label="Descrição / roteiro"><textarea className={inputClass} rows={2} maxLength={1000} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Campo>
              <Campo label="Nota mínima para aprovar (%)" hint="Sugestão para cada auditoria; o auditor pode ajustar. Vale também para o checklist de referência.">
                <input type="number" min={0} max={100} className={cx(inputClass, 'w-28')} value={form.notaMinima} onChange={(e) => setForm({ ...form, notaMinima: Number(e.target.value) })} />
              </Campo>
              <fieldset className="space-y-2 rounded-2xl border border-line p-3">
                <legend className="px-1 text-sm font-semibold">Itens ({form.itens.length}/{MAX_ITENS_AUD}) · peso total {form.itens.reduce((s, i) => s + (Number(i.peso) || 0), 0)}</legend>
                {form.itens.map((it, i) => (
                  <div key={it.id} className="space-y-1.5 rounded-xl bg-paper p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-6 text-xs font-bold text-ink/45">{i + 1}.</span>
                      <input className={cx(inputClass, 'py-1.5')} maxLength={300} placeholder="Ex.: Fachada limpa e iluminada" aria-label={`Texto do item ${i + 1}`} value={it.texto} onChange={(e) => mudarItem(i, { texto: e.target.value })} />
                      <button type="button" className="rounded-lg p-1.5 text-ink/50 hover:bg-white" aria-label={`Subir item ${i + 1}`} onClick={() => moverItem(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" className="rounded-lg p-1.5 text-ink/50 hover:bg-white" aria-label={`Descer item ${i + 1}`} onClick={() => moverItem(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" className="rounded-lg p-1.5 text-red-600 hover:bg-white disabled:opacity-30" aria-label={`Remover item ${i + 1}`} disabled={form.itens.length <= 1} onClick={() => setForm({ ...form, itens: form.itens.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-7 text-xs">
                      <input className={cx(inputClass, 'w-40 py-1 text-xs')} maxLength={60} placeholder="Seção (ex.: Atendimento)" aria-label={`Seção do item ${i + 1}`} value={it.secao} onChange={(e) => mudarItem(i, { secao: e.target.value })} />
                      <label className="flex items-center gap-1">Peso
                        <input type="number" min={1} max={PESO_MAX} className={cx(inputClass, 'w-16 py-1 text-xs')} aria-label={`Peso do item ${i + 1}`} value={it.peso} onChange={(e) => mudarItem(i, { peso: Number(e.target.value) })} />
                      </label>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={form.itens.length >= MAX_ITENS_AUD}
                  onClick={() => setForm({ ...form, itens: [...form.itens, { id: novoItemId(form.itens).replace(/^i/, 'a'), texto: '', secao: form.itens[form.itens.length - 1]?.secao ?? '', peso: 1 }] })}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar item
                </Button>
              </fieldset>
              <div className="space-y-2 rounded-2xl border border-line p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={form.geradoPorIA} onChange={(e) => setForm({ ...form, geradoPorIA: e.target.checked })} /> Itens criados ou revisados com IA
                </label>
                {form.geradoPorIA ? (
                  <Campo label="Qual IA ou modelo participou" hint="Fica registrado no modelo.">
                    <input className={inputClass} maxLength={80} value={form.iaModelo} onChange={(e) => setForm({ ...form, iaModelo: e.target.value })} placeholder="Ex.: Gemini, Grok" />
                  </Campo>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo (disponível para novas auditorias). Modelos não são apagados: desative.
              </label>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void gravar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar modelo'}</Button>
                <Button type="button" variant="secondary" onClick={() => { setForm(null); setEditando(null) }}>Fechar</Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {aba === 'acoes' && !dados.carregando && !dados.erro ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Indicador rotulo="Em aberto" valor={resumo.abertas} />
            <Indicador rotulo="Para validar" valor={resumo.paraValidar} destaque={resumo.paraValidar > 0} />
            <Indicador rotulo="Atrasadas" valor={resumo.atrasadas} alerta={resumo.atrasadas > 0} />
            <Indicador rotulo="Validadas" valor={resumo.validadas} />
          </div>
          <label className="block max-w-xs space-y-1 text-sm">
            <span className="font-medium">Situação</span>
            <select className={inputClass} value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value as StatusAcao | '')}>
              <option value="">Todas</option>
              {STATUS_ACAO.map((s) => <option key={s} value={s}>{ROTULO_STATUS_ACAO[s]}</option>)}
            </select>
          </label>
          {!acoes.length ? <Vazio titulo="Nada por aqui" texto="Os planos de ação nascem nas não conformidades de uma auditoria assinada." /> : null}
          <ul className="space-y-2">
            {acoes.map((a) => (
              <li key={a.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.descricao}</p>
                    <p className="text-xs text-ink/55">
                      {nomeUnidade.get(a.unidadeId) || a.unidadeId} · item: {a.itemTexto || a.itemId} · responsável {a.responsavel} · prazo {formatarDia(a.prazoMs)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusAcaoSelo status={a.status} prazoMs={a.prazoMs} />
                    <Link to={`/auditorias/${a.auditoriaId}`} className="text-xs font-semibold text-brand-dark hover:underline">Ver auditoria</Link>
                  </div>
                </div>
                {a.comentarioUnidade ? <p className="mt-1.5 text-sm text-ink/75"><span className="font-semibold">Unidade:</span> {a.comentarioUnidade}</p> : null}
                {a.comentarioFranqueadora ? <p className="mt-1 text-sm text-ink/75"><span className="font-semibold">Franqueadora:</span> {a.comentarioFranqueadora}</p> : null}
                <div className="mt-1"><LinkEvidencia url={a.evidenciaUrl} /></div>
                {a.status === 'concluida_unidade' ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input className={cx(inputClass, 'max-w-md flex-1 py-1.5')} maxLength={1000} placeholder="Comentário (obrigatório para reabrir)" aria-label="Comentário da franqueadora" value={comentarios[a.id] ?? ''} onChange={(e) => setComentarios({ ...comentarios, [a.id]: e.target.value })} />
                    <Button type="button" onClick={() => void decidir(a, 'validada')} disabled={salvando || dados.carregando}>Validar</Button>
                    <Button type="button" variant="danger" onClick={() => void decidir(a, 'reaberta')} disabled={salvando || dados.carregando}>Reabrir</Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function Indicador({ rotulo, valor, destaque = false, alerta = false }: { rotulo: string; valor: number; destaque?: boolean; alerta?: boolean }) {
  return (
    <div className={cx('rounded-2xl border bg-white p-4 shadow-sm', alerta ? 'border-red-200' : destaque ? 'border-brand/40' : 'border-line')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{rotulo}</p>
      <p className={cx('mt-1 text-2xl font-black tabular-nums', alerta ? 'text-red-700' : 'text-ink')}>{valor}</p>
    </div>
  )
}
