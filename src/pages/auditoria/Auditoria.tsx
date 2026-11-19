import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, PenLine } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Selo, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData, formatarDia } from '../../lib/format'
import { linkHttpsValido } from '../../lib/marketing'
import { ROTULO_RESULTADO, porSecao, type ExecucaoChecklist } from '../../lib/checklist'
import { lerExecucao } from '../../lib/checklistApi'
import {
  ROTULO_MODALIDADE,
  ROTULO_STATUS_ACAO,
  acaoDaUnidade,
  naoConformesSemPlano,
  podeGerirAuditoria,
  resultadoAuditoria,
  scoreRecalculado,
  type AcaoAuditoria,
  type Auditoria,
  type StatusAcao,
} from '../../lib/auditoria'
import { andamentoAcaoUnidade, assinarCiencia, criarAcao, decidirAcao, lerAuditoria, listarAcoesDaAuditoria } from '../../lib/auditoriaApi'
import { useVisao } from '../../lib/visao'
import { LinkEvidencia, ScoreSelo } from '../checklist/partes'
import { Assinatura, ResultadoSelo, RodapeModulo8, StatusAcaoSelo, StatusAudSelo } from './partes'

const COR = { ok: 'bg-lime/25 text-lime-dark', nao_ok: 'bg-red-100 text-red-800', na: 'bg-ink/5 text-ink/60', '': 'bg-ink/5 text-ink/40' }

function deInputData(v: string): Date {
  const [a, m, d] = v.split('-').map(Number)
  return new Date(a, (m || 1) - 1, d || 1, 12)
}

export function AuditoriaPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const [auditoria, setAuditoria] = useState<Auditoria | null>(null)
  const [acoes, setAcoes] = useState<AcaoAuditoria[]>([])
  const [execucao, setExecucao] = useState<ExecucaoChecklist | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [contestacao, setContestacao] = useState('')
  const [ciente, setCiente] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [novaAcao, setNovaAcao] = useState<Record<string, { descricao: string; responsavel: string; prazo: string }>>({})
  const [andamento, setAndamento] = useState<Record<string, { evidencia: string; comentario: string }>>({})
  const [comentarioFr, setComentarioFr] = useState<Record<string, string>>({})
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])

  // Quem pode ler como franqueadora (permissão real, também durante a simulação do admin).
  const leComoGestor = podeGerirAuditoria(user, user?.papel === 'admin')
  const gestor = leComoGestor && !comoFranqueado

  useEffect(() => {
    if (!user) return
    let ativo = true
    setCarregando(true)
    void lerAuditoria(id)
      .then(async (a) => {
        if (!ativo) return
        if (!a) {
          setErro('Auditoria não encontrada.')
          return
        }
        setAuditoria(a)
        const [lista, exec] = await Promise.all([
          a.status === 'rascunho' ? Promise.resolve([]) : listarAcoesDaAuditoria(leComoGestor, a),
          a.checklistExecucaoId ? lerExecucao(a.checklistExecucaoId).catch(() => null) : Promise.resolve(null),
        ])
        if (!ativo) return
        setAcoes(lista)
        setExecucao(exec)
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [id, user, leComoGestor, tique])

  if (!user) return null
  const a = auditoria
  const franqueadoDaUnidade = !!a && !comoFranqueado && user.papel === 'franqueado' && user.unidadeId === a.unidadeId
  const daUnidade = !!a && !comoFranqueado && (user.papel === 'franqueado' || user.papel === 'equipe_franqueado') && user.unidadeId === a.unidadeId

  async function darCiencia() {
    if (!a) return
    if (!ciente) {
      setErro('Marque a declaração de ciência antes de assinar.')
      return
    }
    setGravando(true)
    setErro('')
    try {
      await assinarCiencia(user!, a.id, contestacao)
      setOk('Ciência assinada. A auditoria está concluída e não muda mais.')
      recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setGravando(false)
    }
  }

  async function criarPlano(itemId: string, itemTexto: string) {
    if (!a) return
    const f = novaAcao[itemId] ?? { descricao: '', responsavel: '', prazo: '' }
    if (f.descricao.trim().length < 2 || f.responsavel.trim().length < 2 || !f.prazo) {
      setErro('Preencha a ação, o responsável e o prazo.')
      return
    }
    setErro('')
    try {
      await criarAcao(user!, a, { itemId, itemTexto }, { descricao: f.descricao, responsavel: f.responsavel, prazo: deInputData(f.prazo) })
      setNovaAcao({ ...novaAcao, [itemId]: { descricao: '', responsavel: '', prazo: '' } })
      setOk('Ação criada no plano.')
      recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    }
  }

  async function atualizar(acao: AcaoAuditoria, status: StatusAcao) {
    const f = andamento[acao.id] ?? { evidencia: acao.evidenciaUrl, comentario: acao.comentarioUnidade }
    if (status === 'concluida_unidade' && !linkHttpsValido(f.evidencia.trim())) {
      setErro('Para concluir, informe o link https da evidência (foto no Drive, por exemplo).')
      return
    }
    if (f.evidencia.trim() && !linkHttpsValido(f.evidencia.trim())) {
      setErro('O link da evidência precisa começar com https://.')
      return
    }
    setErro('')
    try {
      await andamentoAcaoUnidade(user!, acao.id, status, f.evidencia, f.comentario)
      setOk(status === 'concluida_unidade' ? 'Ação enviada para validação da franqueadora.' : 'Andamento registrado.')
      recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    }
  }

  async function decidir(acao: AcaoAuditoria, status: 'validada' | 'reaberta') {
    const comentario = comentarioFr[acao.id] ?? ''
    if (status === 'reaberta' && comentario.trim().length < 2) {
      setErro('Para reabrir, explique à unidade o que falta.')
      return
    }
    setErro('')
    try {
      await decidirAcao(user!, acao.id, status, comentario)
      setOk(status === 'validada' ? 'Ação validada.' : 'Ação reaberta para a unidade.')
      recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    }
  }

  const voltar = gestor ? <Link to="/auditoria">Auditoria e Qualidade</Link> : <Link to="/auditorias">Auditorias da unidade</Link>
  const scoreCkRecalc = execucao ? scoreRecalculado(execucao) : null
  const semPlano = a ? naoConformesSemPlano(a, acoes) : []
  const resultadoConfere = a ? resultadoAuditoria(a.score, a.notaMinima, a.checklistScore) === a.resultado : true

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <p className="text-sm text-ink/50">{voltar} / Auditoria</p>
      {carregando && !a ? <Carregando texto="Abrindo a auditoria…" /> : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {a ? (
        <>
          <header className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-1.5">
                  <StatusAudSelo status={a.status} />
                  <Selo tom="marca">{ROTULO_MODALIDADE[a.modalidade]}</Selo>
                  <Selo>Modelo v{a.modeloVersao}</Selo>
                  {a.geradoPorIA ? <Selo>IA: {a.iaModelo}</Selo> : null}
                </div>
                <h1 className="mt-2 text-2xl font-black">{a.modeloTitulo}</h1>
                <p className="text-sm text-ink/65">{a.unidadeNome} · {formatarDia(a.dataVisitaMs)} · auditor {a.auditorNome}</p>
              </div>
              <div className="text-right">
                <ScoreSelo score={a.score} grande />
                <div className="mt-2">{a.status === 'rascunho' ? <Selo>Rascunho</Selo> : <ResultadoSelo resultado={a.resultado} grande />}</div>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-ink/50">Nota mínima</dt><dd className="font-bold">{a.notaMinima}%</dd></div>
              <div><dt className="text-xs text-ink/50">OK / Não OK / N/A</dt><dd className="font-bold">{a.qtdOk} / {a.qtdNaoOk} / {a.qtdNa}</dd></div>
              <div><dt className="text-xs text-ink/50">Pontos</dt><dd className="font-bold">{a.pontosObtidos} de {a.pontosPossiveis}</dd></div>
              <div>
                <dt className="text-xs text-ink/50">Checklist de referência</dt>
                <dd className="font-bold">
                  {a.checklistExecucaoId ? (
                    <>
                      {a.checklistScore}%
                      {gestor || daUnidade ? <Link to={`/checklist/execucao/${a.checklistExecucaoId}`} className="ml-1 text-xs font-semibold text-brand-dark hover:underline">ver</Link> : null}
                    </>
                  ) : '—'}
                </dd>
              </div>
            </dl>
            {scoreCkRecalc !== null && scoreCkRecalc !== a.checklistScore ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-700">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Recalculando pelas respostas, o checklist de referência dá {scoreCkRecalc}% (gravado na auditoria: {a.checklistScore}%).
              </p>
            ) : null}
            {!resultadoConfere ? <p className="mt-2 text-xs font-semibold text-red-700">O resultado gravado não confere com a pontuação.</p> : null}
            {a.status === 'rascunho' && gestor ? (
              <p className="mt-3 text-sm"><Link to={`/auditoria/editar/${a.id}`} className="font-semibold text-brand-dark hover:underline">Continuar o rascunho</Link></p>
            ) : null}
          </header>

          {porSecao(a.respostas).map((g) => (
            <section key={g.secao || 'geral'} className="space-y-2">
              {g.secao ? <h2 className="pt-1 text-sm font-bold uppercase tracking-wide text-ink/55">{g.secao}</h2> : null}
              <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                {g.itens.map(({ item: r, indice }) => (
                  <li key={r.itemId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{indice + 1}. {r.texto} <span className="text-[11px] font-normal text-ink/45">peso {r.peso}</span></p>
                      {r.obs ? <p className="text-sm text-ink/70">{r.obs}</p> : null}
                      <LinkEvidencia url={r.evidenciaUrl} />
                    </div>
                    <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-bold', COR[r.resultado])}>{r.resultado ? ROTULO_RESULTADO[r.resultado] : '—'}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {a.obsGeral ? (
            <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink/55">Parecer do auditor</h2>
              <p className="mt-1 whitespace-pre-line text-sm">{a.obsGeral}</p>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-lg font-bold">Assinaturas</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Assinatura titulo="Auditor" nome={a.assinaturaAuditorNome} emMs={a.assinaturaAuditorEmMs} vazio="Ainda não assinada." />
              <Assinatura titulo="Ciência do franqueado" nome={a.cienciaNome} emMs={a.cienciaEmMs} vazio={a.status === 'rascunho' ? 'Disponível depois da assinatura do auditor.' : 'Aguardando o franqueado da unidade.'} />
            </div>
            {a.contestacao ? (
              <Aviso tom="info"><span className="font-semibold">Contestação do franqueado:</span> <span className="whitespace-pre-line">{a.contestacao}</span></Aviso>
            ) : null}
            {a.status === 'concluida' ? <p className="flex items-center gap-1.5 text-xs text-ink/55"><CheckCircle2 className="h-4 w-4 text-lime-dark" aria-hidden="true" /> Auditoria concluída: com as duas assinaturas, o conteúdo não pode mais ser alterado.</p> : null}
            {a.status === 'aguardando_ciencia' && franqueadoDaUnidade ? (
              <div className="space-y-3 rounded-2xl border border-dashed border-brand/40 bg-brand/5 p-4">
                <p className="flex items-center gap-2 text-sm font-bold"><PenLine className="h-4 w-4" aria-hidden="true" /> Sua ciência</p>
                <Campo label="Contestação (opcional)" hint="Se discorda de algum ponto, registre aqui. A contestação fica junto da auditoria.">
                  <textarea className={inputClass} rows={3} maxLength={2000} value={contestacao} onChange={(e) => setContestacao(e.target.value)} />
                </Campo>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
                  <span>Declaro que tomei ciência do resultado desta auditoria ({a.score}%, {a.resultado}). Assinar ciência não significa concordar; use a contestação se for o caso.</span>
                </label>
                <p className="font-serif text-xl italic">{user.nome}</p>
                <Button type="button" onClick={() => void darCiencia()} disabled={gravando}>{gravando ? 'Assinando…' : 'Assinar ciência'}</Button>
              </div>
            ) : null}
            {a.status === 'aguardando_ciencia' && daUnidade && !franqueadoDaUnidade ? <p className="text-xs text-ink/55">Só o franqueado da unidade assina a ciência.</p> : null}
          </section>

          {a.status !== 'rascunho' ? (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">Plano de ação</h2>
              {!acoes.length && !semPlano.length ? <p className="text-sm text-ink/55">Sem não conformidades: nenhum plano de ação necessário.</p> : null}
              <ul className="space-y-2">
                {acoes.map((ac) => {
                  const f = andamento[ac.id] ?? { evidencia: ac.evidenciaUrl, comentario: ac.comentarioUnidade }
                  const proximos = acaoDaUnidade(ac.status)
                  return (
                    <li key={ac.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-ink/50">Item: {ac.itemTexto || ac.itemId}</p>
                          <p className="font-semibold">{ac.descricao}</p>
                          <p className="text-xs text-ink/55">Responsável {ac.responsavel} · prazo {formatarDia(ac.prazoMs)} · atualizado por {ac.atualizadoPorNome} em {formatarData(ac.atualizadoEmMs)}</p>
                        </div>
                        <StatusAcaoSelo status={ac.status} prazoMs={ac.prazoMs} />
                      </div>
                      {ac.comentarioUnidade ? <p className="mt-1.5 text-sm text-ink/75"><span className="font-semibold">Unidade:</span> {ac.comentarioUnidade}</p> : null}
                      {ac.comentarioFranqueadora ? <p className="mt-1 text-sm text-ink/75"><span className="font-semibold">Franqueadora:</span> {ac.comentarioFranqueadora}</p> : null}
                      <div className="mt-1"><LinkEvidencia url={ac.evidenciaUrl} /></div>
                      {franqueadoDaUnidade && proximos.length ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <input className={inputClass} maxLength={600} placeholder="Link https da evidência (obrigatório para concluir)" aria-label="Evidência da ação" value={f.evidencia} onChange={(e) => setAndamento({ ...andamento, [ac.id]: { ...f, evidencia: e.target.value } })} />
                          <input className={inputClass} maxLength={1000} placeholder="Comentário da unidade" aria-label="Comentário da unidade" value={f.comentario} onChange={(e) => setAndamento({ ...andamento, [ac.id]: { ...f, comentario: e.target.value } })} />
                          <div className="flex gap-2 sm:col-span-2">
                            {proximos.map((s) => (
                              <Button key={s} type="button" variant={s === 'concluida_unidade' ? 'primary' : 'secondary'} onClick={() => void atualizar(ac, s)}>
                                {s === 'concluida_unidade' ? 'Concluir e enviar para validação' : `Marcar como ${ROTULO_STATUS_ACAO[s].toLowerCase()}`}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {gestor && ac.status === 'concluida_unidade' ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input className={cx(inputClass, 'max-w-md flex-1 py-1.5')} maxLength={1000} placeholder="Comentário (obrigatório para reabrir)" aria-label="Comentário da franqueadora" value={comentarioFr[ac.id] ?? ''} onChange={(e) => setComentarioFr({ ...comentarioFr, [ac.id]: e.target.value })} />
                          <Button type="button" onClick={() => void decidir(ac, 'validada')}>Validar</Button>
                          <Button type="button" variant="danger" onClick={() => void decidir(ac, 'reaberta')}>Reabrir</Button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
              {gestor && semPlano.length ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-ink/55">Não conformidades sem plano</h3>
                  {semPlano.map((r) => {
                    const f = novaAcao[r.itemId] ?? { descricao: '', responsavel: '', prazo: '' }
                    return (
                      <div key={r.itemId} className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
                        <p className="font-semibold">{r.texto}</p>
                        {r.obs ? <p className="text-sm text-ink/70">{r.obs}</p> : null}
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_12rem_10rem_auto]">
                          <input className={inputClass} maxLength={1000} placeholder="Ação corretiva" aria-label={`Ação para ${r.texto}`} value={f.descricao} onChange={(e) => setNovaAcao({ ...novaAcao, [r.itemId]: { ...f, descricao: e.target.value } })} />
                          <input className={inputClass} maxLength={120} placeholder="Responsável" aria-label={`Responsável por ${r.texto}`} value={f.responsavel} onChange={(e) => setNovaAcao({ ...novaAcao, [r.itemId]: { ...f, responsavel: e.target.value } })} />
                          <input type="date" className={inputClass} aria-label={`Prazo de ${r.texto}`} value={f.prazo} onChange={(e) => setNovaAcao({ ...novaAcao, [r.itemId]: { ...f, prazo: e.target.value } })} />
                          <Button type="button" onClick={() => void criarPlano(r.itemId, r.texto)}>Criar ação</Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
      <RodapeModulo8 />
    </div>
  )
}
