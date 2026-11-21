import { BotaoCsv } from '../../components/BotaoCsv'
import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { listarTrilhaManuais } from '../../lib/manuaisApi'
import { formatarDuracao, ordenarTrilha, type ItemTrilhaManual } from '../../lib/manuaisTrilha'
import {
  MAX_AULAS,
  MAX_OPCOES,
  MAX_PERGUNTAS,
  MIN_OPCOES,
  limitarReestudo,
  ordenarCursos,
  podeGerirUniversidade,
  resumirResultados,
  slugCurso,
  validarProva,
  type Curso,
  type PerguntaEdicao,
  type Prova,
  type TentativaProva,
} from '../../lib/universidade'
import { fecharTentativaPendente, listarCursos, listarFolhas, listarGabaritos, listarProvas, listarResultados, salvarCurso, salvarProva, type CursoEdicao } from '../../lib/universidadeApi'
import { useVisao } from '../../lib/visao'

type Aba = 'cursos' | 'resultados'

interface ProvaForm {
  titulo: string
  notaMinima: number
  manualRetornoId: string
  tempoReestudoSeg: number
  publicado: boolean
  perguntas: PerguntaEdicao[]
}

let contador = 0
const novaPergunta = (): PerguntaEdicao => ({ id: `p${Date.now().toString(36)}${(contador++).toString(36)}`, enunciado: '', opcoes: ['', ''], correta: -1 })

export function GestaoUniversidadePage() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado } = useVisao()
  const permitido = podeGerirUniversidade(user, ehAdmin) && !comoFranqueado
  const [aba, setAba] = useState<Aba>('cursos')
  const [cursos, setCursos] = useState<Curso[]>([])
  const [provas, setProvas] = useState<Map<string, Prova>>(new Map())
  const [gabaritos, setGabaritos] = useState<Map<string, number[]>>(new Map())
  const [trilha, setTrilha] = useState<ItemTrilhaManual[]>([])
  const [tentativas, setTentativas] = useState<TentativaProva[]>([])
  const [folhas, setFolhas] = useState<Map<string, number[]>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [tique, setTique] = useState(0)
  const [selecionado, setSelecionado] = useState<string>('')
  const [curso, setCurso] = useState<CursoEdicao | null>(null)
  const [prova, setProva] = useState<ProvaForm | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [unidadeFiltro, setUnidadeFiltro] = useState('')

  useEffect(() => {
    if (!user || !permitido) return
    let ativo = true
    setCarregando(true)
    setErroCarga('')
    void Promise.all([listarCursos(true), listarProvas(), listarGabaritos(), listarTrilhaManuais(), listarResultados(user, true)])
      .then(([c, p, g, t, r]) => {
        if (!ativo) return
        setCursos(ordenarCursos(c))
        setProvas(new Map(p.map((item) => [item.cursoId, item])))
        setGabaritos(g)
        setTrilha(ordenarTrilha(t.filter((i) => i.ativo)))
        setTentativas(r)
        return listarFolhas(r).then((f) => ativo && setFolhas(f))
      })
      .catch((falha) => ativo && setErroCarga(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, permitido, tique])

  const titulosTrilha = useMemo(() => new Map(trilha.map((i) => [i.documentoId, i.titulo])), [trilha])
  const resultados = useMemo(() => resumirResultados(tentativas, gabaritos, folhas), [tentativas, gabaritos, folhas])
  const pendentes = tentativas.filter((t) => t.aprovado === null)
  const titulosCurso = new Map(cursos.map((c) => [c.id, c.titulo]))

  if (!user) return null
  if (!permitido) return <Navigate to="/universidade" replace />

  function abrir(id: string) {
    setOk('')
    setErro('')
    setSelecionado(id)
    const atual = cursos.find((c) => c.id === id)
    setCurso(
      atual
        ? { id: atual.id, titulo: atual.titulo, descricao: atual.descricao, ordem: atual.ordem, aulas: atual.aulas, publicado: atual.publicado }
        : { id: '', titulo: '', descricao: '', ordem: cursos.length + 1, aulas: [], publicado: false },
    )
    const p = provas.get(id)
    const corretas = gabaritos.get(id) ?? []
    setProva(
      p
        ? {
            titulo: p.titulo,
            notaMinima: p.notaMinima,
            manualRetornoId: p.manualRetornoId,
            tempoReestudoSeg: p.tempoReestudoSeg,
            publicado: p.publicado,
            perguntas: p.perguntas.map((q, i) => ({ ...q, correta: corretas[i] ?? -1 })),
          }
        : { titulo: atual ? `Prova: ${atual.titulo}`.slice(0, 120) : '', notaMinima: 70, manualRetornoId: atual?.aulas[0] ?? '', tempoReestudoSeg: 300, publicado: false, perguntas: [novaPergunta()] },
    )
  }

  async function gravarCurso() {
    if (!user || !curso) return
    const id = curso.id || slugCurso(curso.titulo)
    if (!curso.id && cursos.some((c) => c.id === id)) {
      setErro('Já existe um curso com esse nome. Use outro título.')
      return
    }
    if (!curso.titulo.trim() || !curso.descricao.trim()) {
      setErro('Preencha título e descrição do curso.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await salvarCurso(user, { ...curso, id })
      setOk('Curso salvo.')
      setSelecionado(id)
      setCurso({ ...curso, id })
      setProva((p) => (p && !p.titulo.trim() ? { ...p, titulo: `Prova: ${curso.titulo.trim()}`.slice(0, 120), manualRetornoId: p.manualRetornoId || curso.aulas[0] || '' } : p))
      setTique((t) => t + 1)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  async function gravarProva() {
    if (!user || !curso?.id || !prova) return
    const erros = validarProva(prova)
    if (erros.length) {
      setErro(erros.join(' '))
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await salvarProva(user, { cursoId: curso.id, ...prova }, provas.get(curso.id)?.versao ?? 0)
      setOk('Prova e gabarito salvos numa versão nova. Tentativas antigas continuam valendo como estavam.')
      setTique((t) => t + 1)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  async function fecharPendente(id: string) {
    if (!window.confirm('Fechar esta tentativa como não aprovada? A pessoa perde esta chance.')) return
    setErro('')
    try {
      await fecharTentativaPendente(id)
      setOk('Tentativa fechada como não aprovada.')
      setTique((t) => t + 1)
    } catch (falha) {
      setErro(mensagemErro(falha))
    }
  }

  const mudarPergunta = (i: number, parcial: Partial<PerguntaEdicao>) =>
    setProva((p) => (p ? { ...p, perguntas: p.perguntas.map((q, j) => (j === i ? { ...q, ...parcial } : q)) } : p))

  const unidades = resultados.filter((u) => !unidadeFiltro || u.unidadeId === unidadeFiltro)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="cabecalho-pagina flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Universidade UBOX · Franqueadora</p>
          <h1 className="text-2xl font-bold text-ink">Gestão da Universidade</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Monte cursos com aulas da trilha de manuais, escreva a prova com a nota mínima e acompanhe os resultados por unidade e pessoa.
            O gabarito fica guardado à parte e só a franqueadora lê.
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Seções da gestão">
          {(['cursos', 'resultados'] as Aba[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={aba === item}
              onClick={() => setAba(item)}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', aba === item ? 'bg-ink text-white' : 'text-muted hover:text-ink')}
            >
              {item === 'cursos' ? 'Cursos e provas' : 'Resultados'}
            </button>
          ))}
        </div>
      </header>

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {erroCarga ? <Aviso tom="erro"><p role="alert">{erroCarga}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => setTique((t) => t + 1)}>Tentar novamente</Button></Aviso> : null}
      {carregando ? <Carregando texto="Carregando a Universidade…" /> : null}

      {aba === 'cursos' && !carregando && !erroCarga ? (
        <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
          <aside className="space-y-2">
            <Button type="button" variant="secondary" className="w-full" onClick={() => abrir('')}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo curso
            </Button>
            {!cursos.length ? <p className="text-sm text-muted">Nenhum curso ainda.</p> : null}
            {cursos.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => abrir(c.id)}
                className={cx('block w-full rounded-2xl border bg-surface p-3 text-left', selecionado === c.id && curso?.id ? 'border-brand' : 'border-line hover:border-ink/30')}
              >
                <span className="flex flex-wrap gap-1.5">
                  {c.publicado ? <Selo tom="lima">Publicado</Selo> : <Selo tom="alerta">Rascunho</Selo>}
                  {provas.get(c.id) ? <Selo>{provas.get(c.id)!.publicado ? `Prova v${provas.get(c.id)!.versao}` : 'Prova em rascunho'}</Selo> : <Selo>Sem prova</Selo>}
                </span>
                <span className="mt-1 block font-semibold">{c.titulo}</span>
                <span className="text-xs text-muted">{c.aulas.length} aula{c.aulas.length === 1 ? '' : 's'}</span>
              </button>
            ))}
          </aside>

          {!curso ? (
            <Vazio titulo="Escolha um curso" texto="Ou crie um novo para começar." />
          ) : (
            <div className="space-y-5">
              <section className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-sm">
                <h2 className="text-lg font-bold">{curso.id ? 'Curso' : 'Novo curso'}</h2>
                <Campo label="Título">
                  <input className={inputClass} value={curso.titulo} maxLength={120} onChange={(e) => setCurso({ ...curso, titulo: e.target.value })} />
                </Campo>
                <Campo label="Descrição">
                  <textarea className={inputClass} rows={3} maxLength={1000} value={curso.descricao} onChange={(e) => setCurso({ ...curso, descricao: e.target.value })} />
                </Campo>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo label="Ordem na lista">
                    <input type="number" min={1} max={999} className={inputClass} value={curso.ordem} onChange={(e) => setCurso({ ...curso, ordem: Number(e.target.value) })} />
                  </Campo>
                  <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium">
                    <input type="checkbox" checked={curso.publicado} onChange={(e) => setCurso({ ...curso, publicado: e.target.checked })} /> Publicado para as unidades
                  </label>
                </div>
                <div>
                  <p className="text-sm font-medium">Aulas (manuais da trilha, até {MAX_AULAS})</p>
                  <ol className="mt-2 space-y-2">
                    {curso.aulas.map((id, i) => (
                      <li key={id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                        <span className="flex-1">{i + 1}. {titulosTrilha.get(id) ?? `${id} (fora da trilha)`}</span>
                        <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => { const a = [...curso.aulas]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setCurso({ ...curso, aulas: a }) }} className="disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" aria-label="Descer" disabled={i === curso.aulas.length - 1} onClick={() => { const a = [...curso.aulas]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setCurso({ ...curso, aulas: a }) }} className="disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                        <button type="button" aria-label="Remover aula" onClick={() => setCurso({ ...curso, aulas: curso.aulas.filter((a) => a !== id) })}><Trash2 className="h-4 w-4 text-red-700" /></button>
                      </li>
                    ))}
                  </ol>
                  {curso.aulas.length < MAX_AULAS ? (
                    <select
                      className={cx(inputClass, 'mt-2')}
                      value=""
                      aria-label="Adicionar aula"
                      onChange={(e) => e.target.value && setCurso({ ...curso, aulas: [...curso.aulas, e.target.value] })}
                    >
                      <option value="">Adicionar manual da trilha…</option>
                      {trilha.filter((i) => !curso.aulas.includes(i.documentoId)).map((i) => (
                        <option key={i.documentoId} value={i.documentoId}>{i.ordem}. {i.titulo} ({formatarDuracao(i.tempoMinimoSeg)})</option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <Button type="button" onClick={() => void gravarCurso()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar curso'}</Button>
              </section>

              {curso.id && prova ? (
                <section className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-bold">Prova e gabarito</h2>
                    {provas.get(curso.id) ? <span className="text-xs text-muted">Versão atual {provas.get(curso.id)!.versao} · por {provas.get(curso.id)!.atualizadoPorNome}</span> : null}
                  </div>
                  <Campo label="Título da prova">
                    <input className={inputClass} value={prova.titulo} maxLength={120} onChange={(e) => setProva({ ...prova, titulo: e.target.value })} />
                  </Campo>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Campo label="Nota mínima (%)">
                      <input type="number" min={1} max={100} className={inputClass} value={prova.notaMinima} onChange={(e) => setProva({ ...prova, notaMinima: Number(e.target.value) })} />
                    </Campo>
                    <Campo label="Manual de retorno" hint="Depois de 3 reprovações a pessoa reestuda este manual.">
                      <select className={inputClass} value={prova.manualRetornoId} onChange={(e) => setProva({ ...prova, manualRetornoId: e.target.value })}>
                        <option value="">Escolha…</option>
                        {trilha.map((i) => <option key={i.documentoId} value={i.documentoId}>{i.titulo}</option>)}
                      </select>
                    </Campo>
                    <Campo label="Tempo do reestudo (min)">
                      <input type="number" min={1} max={240} className={inputClass} value={Math.round(prova.tempoReestudoSeg / 60)} onChange={(e) => setProva({ ...prova, tempoReestudoSeg: limitarReestudo(Number(e.target.value) * 60) })} />
                    </Campo>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={prova.publicado} onChange={(e) => setProva({ ...prova, publicado: e.target.checked })} /> Prova publicada
                  </label>
                  <ol className="space-y-4">
                    {prova.perguntas.map((q, i) => (
                      <li key={q.id} className="rounded-2xl border border-line p-4">
                        <div className="flex items-start gap-2">
                          <span className="pt-2.5 text-sm font-bold">{i + 1}.</span>
                          <textarea className={inputClass} rows={2} maxLength={600} placeholder="Enunciado" value={q.enunciado} onChange={(e) => mudarPergunta(i, { enunciado: e.target.value })} />
                          <button type="button" aria-label="Remover pergunta" onClick={() => setProva({ ...prova, perguntas: prova.perguntas.filter((_, j) => j !== i) })} className="pt-2.5"><Trash2 className="h-4 w-4 text-red-700" /></button>
                        </div>
                        <fieldset className="mt-3 space-y-2 pl-6">
                          <legend className="sr-only">Alternativas da pergunta {i + 1}</legend>
                          {q.opcoes.map((o, k) => (
                            <div key={k} className="flex items-center gap-2">
                              <input type="radio" name={`correta-${q.id}`} aria-label={`Alternativa ${k + 1} é a correta`} checked={q.correta === k} onChange={() => mudarPergunta(i, { correta: k })} />
                              <input className={inputClass} placeholder={`Alternativa ${k + 1}`} value={o} maxLength={300} onChange={(e) => mudarPergunta(i, { opcoes: q.opcoes.map((x, j) => (j === k ? e.target.value : x)) })} />
                              {q.opcoes.length > MIN_OPCOES ? (
                                <button type="button" aria-label="Remover alternativa" onClick={() => mudarPergunta(i, { opcoes: q.opcoes.filter((_, j) => j !== k), correta: q.correta === k ? -1 : q.correta > k ? q.correta - 1 : q.correta })}>
                                  <Trash2 className="h-4 w-4 text-muted" />
                                </button>
                              ) : null}
                            </div>
                          ))}
                          {q.opcoes.length < MAX_OPCOES ? (
                            <button type="button" className="text-xs font-semibold text-brand-dark" onClick={() => mudarPergunta(i, { opcoes: [...q.opcoes, ''] })}>+ alternativa</button>
                          ) : null}
                          <p className="text-xs text-muted">Marque a bolinha da alternativa correta. Ela vai só para o gabarito protegido.</p>
                        </fieldset>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap gap-2">
                    {prova.perguntas.length < MAX_PERGUNTAS ? (
                      <Button type="button" variant="secondary" onClick={() => setProva({ ...prova, perguntas: [...prova.perguntas, novaPergunta()] })}>
                        <Plus className="h-4 w-4" aria-hidden="true" /> Pergunta
                      </Button>
                    ) : null}
                    <Button type="button" onClick={() => void gravarProva()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar prova e gabarito'}</Button>
                  </div>
                </section>
              ) : curso && !curso.id ? (
                <p className="text-sm text-muted">Salve o curso para escrever a prova.</p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {aba === 'resultados' && !carregando && !erroCarga ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select className={cx(inputClass, 'w-auto')} value={unidadeFiltro} onChange={(e) => setUnidadeFiltro(e.target.value)} aria-label="Filtrar por unidade">
              <option value="">Todas as unidades</option>
              {resultados.map((u) => <option key={u.unidadeId} value={u.unidadeId}>{u.unidadeNome}</option>)}
            </select>
            <BotaoCsv arquivo="resultados-universidade" cabecalhos={['Unidade', 'Pessoa', 'Curso', 'Situação', 'Melhor nota (%)', 'Tentativas', 'Ciclos']}
              linhas={unidades.flatMap((u) => u.pessoas.flatMap((p) => p.cursos.map((c) => [
                u.unidadeNome, p.nome, titulosCurso.get(c.cursoId) ?? c.cursoId,
                c.aprovado ? 'Aprovado' : c.aguardandoReestudo ? 'Em reestudo' : 'Reprovado', c.melhorNota, c.tentativas, c.ciclos,
              ])))} />
            <span className="text-sm text-muted">{tentativas.length} tentativa{tentativas.length === 1 ? '' : 's'} na rede</span>
          </div>
          {pendentes.length ? (
            <Aviso>
              <p className="font-semibold">Tentativas sem correção</p>
              <p className="mt-1 text-xs">Normalmente o próprio aparelho corrige em segundos. Se uma ficou parada (por exemplo, a prova mudou de versão no meio), feche como não aprovada.</p>
              <ul className="mt-2 space-y-1">
                {pendentes.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>{t.nome} · {titulosCurso.get(t.cursoId) ?? t.cursoId} · tentativa {t.numero} (ciclo {t.ciclo})</span>
                    <button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => void fecharPendente(t.id)}>Fechar como não aprovada</button>
                  </li>
                ))}
              </ul>
            </Aviso>
          ) : null}
          {!unidades.length ? <Vazio titulo={resultados.length ? 'Nenhum resultado para este filtro' : 'Sem resultados ainda'} texto={resultados.length ? 'Selecione outra unidade.' : 'Quando as unidades fizerem as provas, os resultados aparecem aqui.'} /> : null}
          {unidades.map((u) => (
            <article key={u.unidadeId} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-lg font-bold">{u.unidadeNome}</h2>
                <p className="text-xs text-muted">{u.pessoas.length} pessoa{u.pessoas.length === 1 ? '' : 's'} · {u.aprovados} aprovação{u.aprovados === 1 ? '' : 'ões'} · {u.tentativas} tentativa{u.tentativas === 1 ? '' : 's'}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper/60 text-[11px] font-bold uppercase tracking-wider text-muted">
                      <th className="px-5 py-3">Pessoa</th>
                      <th className="px-4 py-3">Curso</th>
                      <th className="px-4 py-3">Situação</th>
                      <th className="px-4 py-3">Melhor nota</th>
                      <th className="px-5 py-3 text-right">Tentativas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {u.pessoas.flatMap((p) =>
                      p.cursos.map((c, i) => (
                        <tr key={`${p.uid}-${c.cursoId}`} className="border-b border-line last:border-0">
                          <td className="px-5 py-3 font-medium">{i === 0 ? p.nome : ''}</td>
                          <td className="px-4 py-3">{titulosCurso.get(c.cursoId) ?? c.cursoId}</td>
                          <td className="px-4 py-3">
                            {c.aprovado ? <Selo tom="lima">Aprovado</Selo> : c.aguardandoReestudo ? <Selo tom="alerta">Em reestudo</Selo> : <Selo>Reprovado</Selo>}
                          </td>
                          <td className="px-4 py-3">{c.melhorNota === null ? '—' : `${c.melhorNota}%`}</td>
                          <td className="px-5 py-3 text-right text-muted">{c.tentativas}{c.ciclos > 1 ? ` (${c.ciclos} ciclos)` : ''}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
      ) : null}

    </div>
  )
}
