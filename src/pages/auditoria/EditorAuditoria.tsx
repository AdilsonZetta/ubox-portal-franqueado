import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, PenLine } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Selo, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import { RESULTADOS, ROTULO_RESULTADO, calcularTotais, porSecao, type ExecucaoChecklist, type Resposta, type Resultado } from '../../lib/checklist'
import { listarExecucoes, lerExecucao } from '../../lib/checklistApi'
import {
  MODALIDADES,
  ROTULO_MODALIDADE,
  resultadoAuditoria,
  respostasDoModelo,
  scoreRecalculado,
  validarAuditoria,
  type Auditoria,
  type Modalidade,
  type ModeloAuditoria,
} from '../../lib/auditoria'
import { assinarAuditoria, criarAuditoria, lerAuditoria, listarAuditorias, listarModelosAud, salvarRascunho, type DadosAuditoria } from '../../lib/auditoriaApi'
import { ScoreSelo } from '../checklist/partes'
import { useGestaoAuditoriaAcesso } from './useAcesso'
import { ResultadoSelo, RodapeModulo8, useUnidadesAuditaveis } from './partes'

const COR_RESULTADO: Record<Resultado, string> = {
  ok: 'border-lime-dark bg-lime/25 text-lime-dark',
  nao_ok: 'border-red-600 bg-red-50 text-red-700',
  na: 'border-ink/40 bg-ink/5 text-ink/70',
}
const DIA = 86_400_000
const OUTRA = '__outra__'

function paraInputData(ms: number): string {
  const d = new Date(ms || Date.now())
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function deInputData(v: string): Date {
  const [a, m, d] = v.split('-').map(Number)
  return new Date(a, (m || 1) - 1, d || 1, 12)
}

export function EditorAuditoriaPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { gestor, ehAdmin } = useGestaoAuditoriaAcesso()
  const navegar = useNavigate()
  const [existente, setExistente] = useState<Auditoria | null>(null)
  const [modelos, setModelos] = useState<ModeloAuditoria[]>([])
  const [vistas, setVistas] = useState<{ unidadeId: string; unidadeNome: string }[]>([])
  const [modeloId, setModeloId] = useState('')
  const [unidadeSel, setUnidadeSel] = useState('')
  const [outraId, setOutraId] = useState('')
  const [outraNome, setOutraNome] = useState('')
  const [modalidade, setModalidade] = useState<Modalidade>('visita')
  const [dataVisita, setDataVisita] = useState(paraInputData(Date.now()))
  const [notaMinima, setNotaMinima] = useState(80)
  const [respostas, setRespostas] = useState<Resposta[]>([])
  const [obsGeral, setObsGeral] = useState('')
  const [geradoPorIA, setGeradoPorIA] = useState(false)
  const [iaModelo, setIaModelo] = useState('')
  const [execucoes, setExecucoes] = useState<ExecucaoChecklist[]>([])
  const [checklistId, setChecklistId] = useState('')
  const [confirmo, setConfirmo] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [errosItem, setErrosItem] = useState<Record<string, string>>({})
  const unidades = useUnidadesAuditaveis(ehAdmin, vistas)

  useEffect(() => {
    if (!gestor) return
    let ativo = true
    setCarregando(true)
    void Promise.all([
      listarModelosAud(),
      listarAuditorias(true, null).catch(() => []),
      listarExecucoes({ unidadeId: null }, true, { deMs: Date.now() - 120 * DIA, maximo: 300 }).catch(() => []),
      id ? lerAuditoria(id) : Promise.resolve(null),
    ])
      .then(([m, a, e, atual]) => {
        if (!ativo) return
        setModelos(m)
        setVistas([...a, ...e].map((x) => ({ unidadeId: x.unidadeId, unidadeNome: x.unidadeNome })))
        if (id && !atual) setErro('Auditoria não encontrada.')
        if (atual) {
          setExistente(atual)
          setModeloId(atual.modeloId)
          setUnidadeSel(atual.unidadeId)
          setModalidade(atual.modalidade)
          setDataVisita(paraInputData(atual.dataVisitaMs))
          setNotaMinima(atual.notaMinima)
          setRespostas(atual.respostas)
          setObsGeral(atual.obsGeral)
          setGeradoPorIA(atual.geradoPorIA)
          setIaModelo(atual.iaModelo)
          setChecklistId(atual.checklistExecucaoId)
        }
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [gestor, id])

  const unidadeId = existente ? existente.unidadeId : unidadeSel === OUTRA ? outraId.trim() : unidadeSel
  const unidadeNome = existente
    ? existente.unidadeNome
    : unidadeSel === OUTRA
      ? outraNome.trim()
      : (unidades.find((u) => u.id === unidadeSel)?.nome ?? '')

  // Checklists da unidade auditada (últimos 120 dias) para referência.
  useEffect(() => {
    if (!gestor || !unidadeId) {
      setExecucoes([])
      return
    }
    let ativo = true
    void listarExecucoes({ unidadeId: null }, true, { unidadeId, deMs: Date.now() - 120 * DIA, maximo: 60 })
      .then(async (lista) => {
        if (existente?.checklistExecucaoId && !lista.some((x) => x.id === existente.checklistExecucaoId)) {
          const antiga = await lerExecucao(existente.checklistExecucaoId).catch(() => null)
          if (antiga) lista = [antiga, ...lista]
        }
        if (ativo) setExecucoes(lista)
      })
      .catch(() => ativo && setExecucoes([]))
    return () => {
      ativo = false
    }
  }, [gestor, unidadeId, existente?.checklistExecucaoId])

  const modelo = modelos.find((m) => m.id === modeloId) ?? null
  const ativos = modelos.filter((m) => m.ativo)
  const totais = useMemo(() => calcularTotais(respostas.filter((r) => r.resultado)), [respostas])
  const execSel = execucoes.find((x) => x.id === checklistId) ?? null
  const checklistScore = checklistId ? (execSel ? scoreRecalculado(execSel) : (existente?.checklistScore ?? null)) : null
  const resultado = resultadoAuditoria(totais.score, notaMinima, checklistScore)
  const grupos = porSecao(respostas)
  const respondidos = respostas.filter((r) => r.resultado).length

  if (!user) return null
  if (!gestor) return <Navigate to="/" replace />
  if (existente && existente.status !== 'rascunho') return <Navigate to={`/auditorias/${existente.id}`} replace />

  function escolherModelo(idModelo: string) {
    setModeloId(idModelo)
    const m = modelos.find((x) => x.id === idModelo)
    if (m) {
      setRespostas(respostasDoModelo(m))
      setNotaMinima(m.notaMinima)
    } else setRespostas([])
  }

  function mudar(i: number, parte: Partial<Resposta>) {
    setRespostas((atual) => atual.map((r, j) => (j === i ? { ...r, ...parte } : r)))
  }

  function dados(): DadosAuditoria {
    return {
      modalidade,
      dataVisita: deInputData(dataVisita),
      respostas,
      notaMinima,
      checklistExecucaoId: checklistId,
      checklistScore,
      obsGeral,
      geradoPorIA,
      iaModelo,
    }
  }

  function conferir(paraAssinar: boolean): boolean {
    const problemas: string[] = []
    if (!existente) {
      if (!modelo) problemas.push('Escolha o modelo da auditoria.')
      if (!unidadeId) problemas.push('Escolha a unidade auditada.')
      if (unidadeNome.length < 2) problemas.push('Informe o nome da unidade.')
    }
    if (!Number.isInteger(notaMinima) || notaMinima < 0 || notaMinima > 100) problemas.push('A nota mínima vai de 0 a 100.')
    if (geradoPorIA && iaModelo.trim().length < 2) problemas.push('Informe qual IA ou modelo ajudou no relatório.')
    if (checklistId && checklistScore === null) problemas.push('Não consegui ler o checklist de referência; escolha outro ou remova a referência.')
    const porItem = validarAuditoria(respostas, paraAssinar)
    setErrosItem(porItem)
    if (Object.keys(porItem).length) problemas.push(`${Object.keys(porItem).length} item(ns) precisam de atenção.`)
    if (paraAssinar && !confirmo) problemas.push('Marque a declaração antes de assinar.')
    setErro(problemas.join(' '))
    return !problemas.length
  }

  async function salvar(assinar: boolean) {
    if (!user || !conferir(assinar)) return
    setGravando(true)
    setOk('')
    try {
      let alvo = existente?.id ?? ''
      if (!alvo) {
        if (!modelo) return
        alvo = await criarAuditoria(user, modelo, { id: unidadeId, nome: unidadeNome }, dados())
      } else if (!assinar) {
        await salvarRascunho(alvo, dados())
      }
      if (assinar) {
        await assinarAuditoria(user, alvo, dados())
        navegar(`/auditorias/${alvo}`)
        return
      }
      if (!existente) navegar(`/auditoria/editar/${alvo}`, { replace: true })
      else {
        setOk('Rascunho salvo. Itens sem marcação ficam como N/A até você marcar.')
        setExistente(await lerAuditoria(alvo))
      }
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setGravando(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28">
      <p className="text-sm text-ink/50">
        <Link to="/auditoria">Auditoria e Qualidade</Link> / {existente ? 'Rascunho' : 'Nova auditoria'}
      </p>
      {carregando ? <Carregando texto="Preparando a auditoria…" /> : null}
      {!carregando ? (
        <>
          <header>
            <h1 className="text-3xl font-extrabold">{existente ? existente.modeloTitulo : 'Nova auditoria'}</h1>
            <p className="mt-1 text-sm text-ink/65">
              {existente
                ? `${existente.unidadeNome} · versão ${existente.modeloVersao} do modelo · rascunho criado em ${formatarData(existente.criadoEmMs)}`
                : 'Escolha o modelo e a unidade. Depois de assinada, a auditoria não muda mais; o franqueado assina a ciência e pode registrar contestação.'}
            </p>
          </header>

          <section className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:grid-cols-2">
            {!existente ? (
              <>
                <Campo label="Modelo">
                  <select className={inputClass} value={modeloId} onChange={(e) => escolherModelo(e.target.value)}>
                    <option value="">Escolha…</option>
                    {ativos.map((m) => <option key={m.id} value={m.id}>{m.titulo} (v{m.versao}, {m.totalItens} itens)</option>)}
                  </select>
                </Campo>
                <Campo label="Unidade auditada" hint={ehAdmin ? undefined : 'Lista as unidades com checklists ou auditorias recentes. Se não aparecer, use “Outra unidade”.'}>
                  <select className={inputClass} value={unidadeSel} onChange={(e) => { setUnidadeSel(e.target.value); setChecklistId('') }}>
                    <option value="">Escolha…</option>
                    {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    <option value={OUTRA}>Outra unidade (informar o código)</option>
                  </select>
                </Campo>
                {unidadeSel === OUTRA ? (
                  <>
                    <Campo label="Código da unidade" hint="O código (ID) que aparece no cadastro da unidade.">
                      <input className={inputClass} maxLength={64} value={outraId} onChange={(e) => { setOutraId(e.target.value); setChecklistId('') }} />
                    </Campo>
                    <Campo label="Nome da unidade"><input className={inputClass} maxLength={120} value={outraNome} onChange={(e) => setOutraNome(e.target.value)} /></Campo>
                  </>
                ) : null}
                {!ativos.length ? <p className="text-sm text-amber-800 sm:col-span-2">Nenhum modelo ativo. Crie um na aba <Link className="font-semibold underline" to="/auditoria?aba=modelos">Modelos</Link>.</p> : null}
              </>
            ) : null}
            <Campo label="Modalidade">
              <select className={inputClass} value={modalidade} onChange={(e) => setModalidade(e.target.value as Modalidade)}>
                {MODALIDADES.map((m) => <option key={m} value={m}>{ROTULO_MODALIDADE[m]}</option>)}
              </select>
            </Campo>
            <Campo label="Data da auditoria"><input type="date" className={inputClass} value={dataVisita} onChange={(e) => setDataVisita(e.target.value)} /></Campo>
            <Campo label="Nota mínima para aprovar (%)">
              <input type="number" min={0} max={100} className={inputClass} value={notaMinima} onChange={(e) => setNotaMinima(Number(e.target.value))} />
            </Campo>
            <Campo label="Checklist de referência (opcional)" hint="O score é recalculado aqui pelas respostas do checklist, sem confiar no total gravado.">
              <select className={inputClass} value={checklistId} disabled={!unidadeId} onChange={(e) => setChecklistId(e.target.value)}>
                <option value="">Sem checklist de referência</option>
                {execucoes.map((x) => <option key={x.id} value={x.id}>{formatarData(x.criadoEmMs)} · {x.modeloTitulo} · {scoreRecalculado(x)}%</option>)}
              </select>
            </Campo>
            {execSel && execSel.score !== scoreRecalculado(execSel) ? (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700 sm:col-span-2">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> O score gravado nesse checklist ({execSel.score}%) não confere com as respostas; vale o recalculado ({scoreRecalculado(execSel)}%).
              </p>
            ) : null}
          </section>

          {grupos.map((g) => (
            <section key={g.secao || 'geral'} className="space-y-2">
              {g.secao ? <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-ink/55">{g.secao}</h2> : null}
              <ol className="space-y-2">
                {g.itens.map(({ item: r, indice }) => {
                  const erroItem = errosItem[r.itemId]
                  return (
                    <li key={r.itemId} className={cx('rounded-2xl border bg-white p-4 shadow-sm', erroItem ? 'border-red-300' : 'border-line')}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{indice + 1}. {r.texto}</p>
                          <p className="mt-0.5 text-[11px] text-ink/50">Peso {r.peso}</p>
                        </div>
                        <div className="flex gap-1.5" role="group" aria-label={`Resultado do item ${indice + 1}`}>
                          {RESULTADOS.map((res) => (
                            <button
                              key={res}
                              type="button"
                              aria-pressed={r.resultado === res}
                              onClick={() => mudar(indice, { resultado: res })}
                              className={cx('min-w-16 rounded-xl border px-3 py-1.5 text-sm font-bold', r.resultado === res ? COR_RESULTADO[res] : 'border-line text-ink/60 hover:border-ink/30')}
                            >
                              {ROTULO_RESULTADO[res]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input className={inputClass} maxLength={500} placeholder={r.resultado === 'nao_ok' ? 'Não conformidade encontrada (obrigatório)' : 'Observação'} aria-label={`Observação do item ${indice + 1}`} value={r.obs} onChange={(e) => mudar(indice, { obs: e.target.value })} />
                        <input className={inputClass} maxLength={600} placeholder="Link da foto/evidência (https, opcional)" aria-label={`Evidência do item ${indice + 1}`} value={r.evidenciaUrl} onChange={(e) => mudar(indice, { evidenciaUrl: e.target.value })} />
                      </div>
                      {erroItem ? <p className="mt-2 text-xs font-semibold text-red-700">{erroItem}</p> : null}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}

          {respostas.length ? (
            <section className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">Parecer geral do auditor</span>
                <textarea className={inputClass} rows={4} maxLength={4000} value={obsGeral} onChange={(e) => setObsGeral(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={geradoPorIA} onChange={(e) => setGeradoPorIA(e.target.checked)} /> Usei IA para redigir ou revisar o relatório
              </label>
              {geradoPorIA ? (
                <Campo label="Qual IA ou modelo" hint="Fica registrado na auditoria.">
                  <input className={inputClass} maxLength={80} value={iaModelo} onChange={(e) => setIaModelo(e.target.value)} placeholder="Ex.: Gemini, Grok" />
                </Campo>
              ) : null}
              <div className="rounded-2xl border border-dashed border-brand/40 bg-brand/5 p-4">
                <p className="flex items-center gap-2 text-sm font-bold"><PenLine className="h-4 w-4" aria-hidden="true" /> Assinatura do auditor</p>
                <p className="mt-1 font-serif text-xl italic">{user.nome}</p>
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
                  <span>Declaro que conferi os itens desta auditoria. Ao assinar, o resultado ({totais.score}%{checklistScore !== null ? ` e checklist ${checklistScore}%` : ''} contra a nota mínima de {notaMinima}%) fica registrado com data e hora do servidor e não pode mais ser alterado.</span>
                </label>
              </div>
            </section>
          ) : null}

          {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
          {ok ? <Aviso tom="ok">{ok}</Aviso> : null}

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur lg:left-[272px]">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ScoreSelo score={totais.score} />
                {respostas.length ? <ResultadoSelo resultado={resultado} /> : null}
                {checklistScore !== null ? <Selo>Checklist {checklistScore}%</Selo> : null}
                <span className="text-ink/60">{respondidos}/{respostas.length} marcados · {totais.qtdNaoOk} não OK</span>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => void salvar(false)} disabled={gravando || (!existente && !respostas.length)}>Salvar rascunho</Button>
                <Button type="button" onClick={() => void salvar(true)} disabled={gravando || !respostas.length}>{gravando ? 'Gravando…' : 'Assinar e enviar para ciência'}</Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
      <RodapeModulo8 />
    </div>
  )
}
