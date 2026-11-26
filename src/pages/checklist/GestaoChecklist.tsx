import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { BACKEND } from '../../lib/backend'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import { listarUnidades } from '../../lib/gestao'
import {
  FREQUENCIAS,
  MAX_ITENS,
  PESO_MAX,
  ROTULO_FREQ,
  ROTULO_TIPO_CK,
  TIPOS_CHECKLIST,
  filtrarExecucoes,
  inicioPeriodo,
  mediaScore,
  modeloServeUnidade,
  naoConformidades,
  novoItemId,
  pesoTotalDe,
  situacaoModelo,
  validarModelo,
  type ModeloChecklist,
  type ModeloForm,
} from '../../lib/checklist'
import { salvarModelo } from '../../lib/checklistApi'
import { useVisao } from '../../lib/visao'
import { Filtros, useFiltros } from './Historico'
import { ListaNaoConformidades, ScoreSelo, SituacaoSelo } from './partes'
import { ListaHistorico } from './ListaHistorico'
import { useChecklist } from './useChecklist'

type Aba = 'modelos' | 'execucoes' | 'nc' | 'pendencias'
const ROTULO_ABA: Record<Aba, string> = { modelos: 'Modelos', execucoes: 'Execuções', nc: 'Não conformidades', pendencias: 'Pendências da rede' }
const DIA = 86_400_000

const formVazio: ModeloForm = {
  titulo: '', descricao: '', tipo: 'abertura', frequencia: 'diaria',
  itens: [{ id: 'i1', texto: '', secao: '', peso: 1, exigeEvidencia: false, exigeObs: false }],
  publico: true, unidades: [], ativo: true, geradoPorIA: false, iaModelo: '',
}

function paraForm(m: ModeloChecklist): ModeloForm {
  return {
    titulo: m.titulo, descricao: m.descricao, tipo: m.tipo, frequencia: m.frequencia, itens: m.itens.map((i) => ({ ...i })),
    horarioLiberacao: m.horarioLiberacao,
    publico: m.publico, unidades: [...m.unidades], ativo: m.ativo, geradoPorIA: m.geradoPorIA, iaModelo: m.iaModelo,
  }
}

/** Admin lê todas as unidades; a equipe da franqueadora usa as unidades que aparecem nas execuções. */
function useUnidades(ehAdmin: boolean, vistas: { unidadeId: string; unidadeNome: string }[]) {
  const [unidades, setUnidades] = useState<{ id: string; nome: string; checklist: boolean }[]>([])
  useEffect(() => {
    if (!ehAdmin) return
    void listarUnidades()
      .then((lista) => setUnidades(lista.filter((u) => u.ativo).map((u) => ({ id: u.id, nome: u.nome, checklist: u.modulosLiberados.includes('checklist') }))))
      .catch(() => undefined)
  }, [ehAdmin])
  return useMemo(() => {
    const mapa = new Map(unidades.map((u) => [u.id, u]))
    for (const v of vistas) if (v.unidadeId && !mapa.has(v.unidadeId)) mapa.set(v.unidadeId, { id: v.unidadeId, nome: v.unidadeNome || v.unidadeId, checklist: true })
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [unidades, vistas])
}

export function GestaoChecklistPage() {
  const { user } = useAuth()
  const { ehAdmin } = useVisao()
  const [params, setParams] = useSearchParams()
  const aba = (Object.keys(ROTULO_ABA).includes(params.get('aba') ?? '') ? params.get('aba') : 'modelos') as Aba
  const f = useFiltros(30)
  const [unidadeId, setUnidadeId] = useState('')
  const dados = useChecklist({ unidadeId: unidadeId || undefined, deMs: f.deMs, ateMs: f.ateMs, maximo: 500 })
  const unidades = useUnidades(ehAdmin, dados.execucoes)
  const [editando, setEditando] = useState<ModeloChecklist | null>(null)
  const [form, setForm] = useState<ModeloForm | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  if (!user) return null
  if (!dados.gestor) return <Navigate to="/checklist" replace />

  const admin = user.papel === 'admin'
  const podeEditarHorario = admin && BACKEND === 'supabase'
  const execucoes = filtrarExecucoes(dados.execucoes, { modeloId: f.modeloId })
  const media = mediaScore(execucoes)
  const ncs = naoConformidades(execucoes)
  const modelosFiltro = dados.modelos.map((m) => ({ id: m.id, titulo: m.titulo }))

  function mudarItem(i: number, parte: Partial<ModeloForm['itens'][number]>) {
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
    if (!user || !form || salvando) return
    setOk('')
    const erros = validarModelo(form)
    if (erros.length) {
      setErro(erros.join(' '))
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await salvarModelo(user, editando, form)
      setOk(editando ? 'Modelo atualizado. Se os itens mudaram, a versão subiu e as execuções antigas guardam a versão que usaram.' : 'Modelo criado.')
      setForm(null)
      setEditando(null)
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="cabecalho-pagina flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Checklist Operacional · Franqueadora</p>
          <h1 className="text-2xl font-bold text-ink">Gestão do checklist</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">Monte os modelos, acompanhe as execuções e o score das unidades, as não conformidades e quem está atrasado.</p>
        </div>
        <div className="flex flex-wrap rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Seções da gestão">
          {(Object.keys(ROTULO_ABA) as Aba[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={aba === item}
              onClick={() => { setParams({ aba: item }); setErro(''); setOk('') }}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', aba === item ? 'bg-ink text-white' : 'text-muted hover:text-ink')}
            >
              {ROTULO_ABA[item]}
            </button>
          ))}
        </div>
      </header>

      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {dados.erro ? <Aviso tom="erro"><p role="alert">{dados.erro}</p><Button type="button" variant="secondary" className="mt-2" onClick={dados.recarregar}>Tentar novamente</Button></Aviso> : null}
      {dados.carregando ? <Carregando texto="Carregando…" /> : null}

      {aba === 'modelos' && !dados.carregando && !dados.erro ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_32rem]">
          <section className="space-y-2">
            <Button type="button" variant="secondary" onClick={() => { setEditando(null); setForm({ ...formVazio, itens: formVazio.itens.map((i) => ({ ...i })) }); setOk('') }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo modelo
            </Button>
            {!dados.modelos.length ? <Vazio titulo="Nenhum modelo ainda" texto="Crie o checklist de abertura, fechamento, limpeza ou vistoria." /> : null}
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {[...dados.modelos].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.titulo.localeCompare(b.titulo, 'pt-BR')).map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => { setEditando(m); setForm(paraForm(m)); setOk('') }} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper', editando?.id === m.id && 'bg-paper')}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.titulo}</span>
                      <span className="text-xs text-muted">
                        {ROTULO_TIPO_CK[m.tipo]} · {ROTULO_FREQ[m.frequencia]} · {m.totalItens} itens · v{m.versao} · {m.publico ? 'rede toda' : `${m.unidades.length} unidade(s)`}{m.geradoPorIA ? ` · IA: ${m.iaModelo}` : ''}
                      </span>
                      {m.horarioLiberacao ? <span className="block text-xs font-semibold text-ink-soft">Libera às {m.horarioLiberacao}</span> : null}
                    </span>
                    {m.ativo ? <Selo tom="lima">Ativo</Selo> : <Selo>Inativo</Selo>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {form ? (
            <section className="space-y-3 rounded-3xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-lg font-bold">{editando ? `Editar modelo (v${editando.versao})` : 'Novo modelo'}</h2>
              <Campo label="Título"><input className={inputClass} maxLength={120} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></Campo>
              <Campo label="Descrição / instruções"><textarea className={inputClass} rows={2} maxLength={1000} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Tipo">
                  <select className={inputClass} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as ModeloForm['tipo'] })}>
                    {TIPOS_CHECKLIST.map((t) => <option key={t} value={t}>{ROTULO_TIPO_CK[t]}</option>)}
                  </select>
                </Campo>
                <Campo label="Frequência">
                  <select className={inputClass} value={form.frequencia} onChange={(e) => setForm({ ...form, frequencia: e.target.value as ModeloForm['frequencia'] })}>
                    {FREQUENCIAS.map((t) => <option key={t} value={t}>{ROTULO_FREQ[t]}</option>)}
                  </select>
                </Campo>
              </div>
              <div className="rounded-xl border border-line bg-paper p-3">
                <Campo label="Liberar preenchimento a partir de">
                  <input
                    type="time"
                    name="horarioLiberacao"
                    autoComplete="off"
                    className={cx(inputClass, 'max-w-48 disabled:opacity-70')}
                    aria-describedby="ajuda-horario-liberacao"
                    disabled={!podeEditarHorario}
                    value={form.horarioLiberacao ?? ''}
                    onChange={(e) => setForm({ ...form, horarioLiberacao: e.target.value || null })}
                  />
                </Campo>
                <div id="ajuda-horario-liberacao" className="mt-2 space-y-1 text-xs text-muted">
                  <p>Horário de Brasília, vale todos os dias. Deixe em branco para liberar o dia todo.</p>
                  {!admin ? <p>Somente o administrador da franqueadora define o horário.</p> : null}
                  {admin && !podeEditarHorario ? <p>A configuração de horário está disponível no Supabase.</p> : null}
                </div>
                {podeEditarHorario ? (
                  <Button type="button" variant="secondary" className="mt-2" disabled={!form.horarioLiberacao} onClick={() => setForm({ ...form, horarioLiberacao: null })}>
                    Limpar horário
                  </Button>
                ) : null}
              </div>

              <fieldset className="space-y-2 rounded-2xl border border-line p-3">
                <legend className="px-1 text-sm font-semibold">Itens ({form.itens.length}/{MAX_ITENS}) · peso total {pesoTotalDe(form.itens)}</legend>
                {form.itens.map((it, i) => (
                  <div key={it.id} className="space-y-1.5 rounded-xl bg-paper p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-6 text-xs font-bold text-muted">{i + 1}.</span>
                      <input className={cx(inputClass, 'py-1.5')} maxLength={300} placeholder="Ex.: Conferir o fundo de troco do caixa" aria-label={`Texto do item ${i + 1}`} value={it.texto} onChange={(e) => mudarItem(i, { texto: e.target.value })} />
                      <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-surface" aria-label={`Subir item ${i + 1}`} onClick={() => moverItem(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" className="rounded-lg p-1.5 text-muted hover:bg-surface" aria-label={`Descer item ${i + 1}`} onClick={() => moverItem(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" className="rounded-lg p-1.5 text-red-600 hover:bg-surface disabled:opacity-30" aria-label={`Remover item ${i + 1}`} disabled={form.itens.length <= 1} onClick={() => setForm({ ...form, itens: form.itens.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-7 text-xs">
                      <input className={cx(inputClass, 'w-36 py-1 text-xs')} maxLength={60} placeholder="Seção (opcional)" aria-label={`Seção do item ${i + 1}`} value={it.secao} onChange={(e) => mudarItem(i, { secao: e.target.value })} />
                      <label className="flex items-center gap-1">Peso
                        <input type="number" min={1} max={PESO_MAX} className={cx(inputClass, 'w-16 py-1 text-xs')} aria-label={`Peso do item ${i + 1}`} value={it.peso} onChange={(e) => mudarItem(i, { peso: Number(e.target.value) })} />
                      </label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={it.exigeEvidencia} onChange={(e) => mudarItem(i, { exigeEvidencia: e.target.checked })} /> Exige foto/link</label>
                      <label className="flex items-center gap-1"><input type="checkbox" checked={it.exigeObs} onChange={(e) => mudarItem(i, { exigeObs: e.target.checked })} /> Exige observação</label>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="secondary" disabled={form.itens.length >= MAX_ITENS} onClick={() => setForm({ ...form, itens: [...form.itens, { id: novoItemId(form.itens), texto: '', secao: form.itens[form.itens.length - 1]?.secao ?? '', peso: 1, exigeEvidencia: false, exigeObs: false }] })}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar item
                </Button>
                {editando ? <p className="text-[11px] text-muted">Mudar itens, pesos ou exigências sobe a versão do modelo; as execuções antigas guardam a versão que usaram.</p> : null}
              </fieldset>

              <div className="space-y-2 rounded-2xl border border-line p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={form.publico} onChange={(e) => setForm({ ...form, publico: e.target.checked })} /> Para a rede toda
                </label>
                {!form.publico ? (
                  <fieldset className="max-h-40 space-y-1 overflow-y-auto">
                    <legend className="text-xs text-muted">Unidades que recebem (até 30)</legend>
                    {!unidades.length ? <p className="text-xs text-muted">Nenhuma unidade disponível para escolher.</p> : null}
                    {unidades.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={form.unidades.includes(u.id)} onChange={(e) => setForm({ ...form, unidades: e.target.checked ? [...form.unidades, u.id] : form.unidades.filter((x) => x !== u.id) })} />
                        {u.nome}{!u.checklist ? <span className="text-[11px] text-muted">(sem o módulo)</span> : null}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
              </div>
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
                <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Ativo (as unidades preenchem). Modelos não são apagados: desative.
              </label>
              <div className="flex gap-2">
                {erro ? <Aviso tom="erro"><p role="alert">{erro}</p></Aviso> : null}
                <Button type="button" onClick={() => void gravar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar modelo'}</Button>
                <Button type="button" variant="secondary" onClick={() => { setForm(null); setEditando(null) }}>Fechar</Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {aba === 'execucoes' || aba === 'nc' ? (
        <section className="space-y-4">
          <Filtros
            f={f}
            modelos={modelosFiltro}
            extra={
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Unidade</span>
                <select className={inputClass} value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
                  <option value="">Todas</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </label>
            }
          />
          {!dados.carregando && !dados.erro ? (
            <>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
                <span>{execucoes.length} checklist(s)</span>
                {media !== null ? <span className="inline-flex items-center gap-1.5">score médio <ScoreSelo score={media} /></span> : null}
                <span>{ncs.length} não conformidade(s)</span>
              </div>
              {aba === 'execucoes' ? <ListaHistorico execucoes={execucoes} mostrarUnidade /> : <ListaNaoConformidades itens={ncs} mostrarUnidade />}
            </>
          ) : null}
        </section>
      ) : null}

      {aba === 'pendencias' ? <PendenciasRede ehAdmin={ehAdmin} /> : null}

    </div>
  )
}

function PendenciasRede({ ehAdmin }: { ehAdmin: boolean }) {
  const agora = Date.now()
  const dados = useChecklist({ deMs: inicioPeriodo('diaria', agora) - 62 * DIA, maximo: 1000 })
  const unidades = useUnidades(ehAdmin, dados.execucoes).filter((u) => u.checklist)
  const recorrentes = dados.modelos.filter((m) => m.ativo && m.frequencia !== 'avulsa')
  if (dados.carregando) return <Carregando texto="Calculando pendências…" />
  if (dados.erro) return null
  if (!recorrentes.length) return <Vazio titulo="Nenhum checklist recorrente ativo" texto="Pendências e atrasos valem para checklists diários, semanais e mensais." />
  if (!unidades.length) return <Vazio titulo="Nenhuma unidade para acompanhar" texto="Libere o módulo Checklist para as unidades." />
  return (
    <section className="space-y-2">
      <p className="text-sm text-muted">
        Atrasado: o período anterior ficou sem checklist. Pendente: ainda falta no período atual. Baseado nos últimos 2 meses.
        {!ehAdmin ? ' Como equipe da franqueadora, você vê as unidades que já enviaram checklists.' : ''}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Unidade</th>
              {recorrentes.map((m) => <th key={m.id} className="px-4 py-2.5 font-semibold">{m.titulo} <span className="font-normal normal-case">({ROTULO_FREQ[m.frequencia].toLowerCase()})</span></th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {unidades.map((u) => {
              const daUnidade = dados.execucoes.filter((e) => e.unidadeId === u.id)
              return (
                <tr key={u.id}>
                  <td className="px-4 py-2.5 font-medium">{u.nome}</td>
                  {recorrentes.map((m) => {
                    if (!modeloServeUnidade(m, u.id)) return <td key={m.id} className="px-4 py-2.5 text-ink/30">—</td>
                    const s = situacaoModelo(m, daUnidade, agora)
                    return (
                      <td key={m.id} className="px-4 py-2.5">
                        <SituacaoSelo situacao={s.situacao} />
                        <span className="block text-[11px] text-muted">{s.ultimaMs ? formatarData(s.ultimaMs) : 'nunca'}</span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
