import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Plus, Share2, Trash2 } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData, formatarDia } from '../../lib/format'
import { listarUnidades } from '../../lib/gestao'
import {
  ROTULO_TIPO_REG,
  ROTULO_FONTE,
  fontesIndisponiveis,
  motivoSaude,
  type EstadoFonte,
  TIPOS_REGISTRO,
  resumirUnidade,
  saudeDe,
  sinaisSaude,
  validarRegistro,
  type PassoAc,
  type RegistroAc,
  type RegistroForm,
} from '../../lib/acompanhamento'
import { carregarAcompanhamento, decidirPasso, salvarRegistro, type DadosAcompanhamento } from '../../lib/acompanhamentoApi'
import type { Unidade } from '../../types'
import { ScoreSelo } from '../checklist/partes'
import { ResultadoSelo } from '../auditoria/partes'
import { CriteriosSaude, ListaSinais, SaudeSelo, StatusPassoSelo, useAcessoAcompanhamento } from './partes'

const hoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const paraInput = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const formVazio = (): RegistroForm => ({ tipo: 'visita', data: hoje(), notas: '', compartilhado: false, geradoPorIA: false, iaModelo: '', passos: [] })

function Cartao({ titulo, children, estados = [] }: { titulo: string; children: ReactNode; estados?: EstadoFonte[] }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/50">{titulo}</h2>
      <div className="mt-2 text-sm">
        {estados.includes('falhou') ? <p className="text-ink-soft">Dados indisponíveis — a consulta falhou.</p>
          : estados.length && estados.every((estado) => estado === 'vazia') ? <p className="text-ink-soft">Nenhum registro.</p>
          : children}
      </div>
    </section>
  )
}
const Numero = ({ valor, rotulo, alerta = false }: { valor: ReactNode; rotulo: string; alerta?: boolean }) => (
  <div>
    <p className={cx('text-xl font-black tabular-nums', alerta ? 'text-red-700' : 'text-ink')}>{valor}</p>
    <p className="text-[11px] text-ink/55">{rotulo}</p>
  </div>
)

export function PainelUnidadePage() {
  const { id = '' } = useParams()
  return <PainelUnidade key={id} id={id} />
}

function PainelUnidade({ id }: { id: string }) {
  const { user } = useAuth()
  const { gestor } = useAcessoAcompanhamento()
  const [unidade, setUnidade] = useState<Unidade | null>(null)
  const [dados, setDados] = useState<DadosAcompanhamento | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [form, setForm] = useState<RegistroForm | null>(null)
  const [editando, setEditando] = useState<RegistroAc | null>(null)
  const gravacaoEmCurso = useRef(false)
  const [salvando, setSalvando] = useState(false)
  const [comentarios, setComentarios] = useState<Record<string, string>>({})
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])

  useEffect(() => {
    if (!gestor) return
    let ativo = true
    setErroCarga('')
    setCarregando(true)
    void Promise.all([listarUnidades(), carregarAcompanhamento(id)])
      .then(([lista, d]) => {
        if (!ativo) return
        const u = lista.find((x) => x.id === id) ?? null
        if (!u) setErroCarga('Unidade não encontrada.')
        setUnidade(u)
        setDados(d)
      })
      .catch((falha) => ativo && setErroCarga(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [gestor, id, tique])

  if (!user) return null
  if (!gestor) return <Navigate to="/" replace />

  const agora = Date.now()
  const resumo = unidade && dados ? resumirUnidade(unidade, dados.fontes, agora, dados.vigenciasChecklist) : null
  const sinais = resumo ? sinaisSaude(resumo, agora) : []
  const saude = saudeDe(sinais)
  const motivo = motivoSaude(sinais)
  const fontesComFalha = resumo ? fontesIndisponiveis(resumo.estados).map((fonte) => ROTULO_FONTE[fonte]) : []

  async function gravar() {
    if (gravacaoEmCurso.current || carregando) return
    if (!user || !form || !unidade || !dados) return
    const erros = validarRegistro(form)
    if (erros.length) {
      setErro(erros.join(' '))
      return
    }
    setErro('')
    gravacaoEmCurso.current = true
    setSalvando(true)
    setOk('')
    try {
      const passosDoRegistro = editando ? dados.passos.filter((p) => p.registroId === editando.id) : []
      await salvarRegistro(user, { id: unidade.id, nome: unidade.nome }, editando, passosDoRegistro, form)
      setOk(editando ? 'Registro atualizado.' : 'Registro salvo.')
      setForm(null)
      setEditando(null)
      recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      gravacaoEmCurso.current = false
      setSalvando(false)
    }
  }

  async function decidir(p: PassoAc, status: 'validado' | 'reaberto') {
    if (gravacaoEmCurso.current || carregando) return
    if (!user) return
    const comentario = comentarios[p.id] ?? ''
    if (status === 'reaberto' && comentario.trim().length < 2) {
      setErro('Para reabrir, explique à unidade o que falta.')
      return
    }
    setErro('')
    if (status === 'reaberto' && !window.confirm('Reabrir este passo para a unidade?')) return
    gravacaoEmCurso.current = true
    setSalvando(true)
    setOk('')
    try {
      await decidirPasso(user, p, status, comentario)
      setOk(status === 'validado' ? 'Passo validado.' : 'Passo reaberto para a unidade.')
      recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      gravacaoEmCurso.current = false
      setSalvando(false)
    }
  }

  function mudarPasso(i: number, parte: Partial<RegistroForm['passos'][number]>) {
    if (!form) return
    setForm({ ...form, passos: form.passos.map((p, j) => (j === i ? { ...p, ...parte } : p)) })
  }

  const f = dados?.fontes
  const registrosIndisponiveis = f?.registros === null || f?.passos === null
  const ultima = resumo?.auditoria.ultima ?? null
  const acoes = resumo?.auditoria.acoes

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink/50"><Link to="/acompanhamento">Acompanhamento</Link> / Unidade</p>
      {erroCarga ? <Aviso tom="erro"><span role="alert">{erroCarga}</span> <Button variant="ghost" onClick={recarregar}>Tentar novamente</Button></Aviso> : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {salvando && !form ? <Carregando texto="Gravando alteração…" /> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {carregando && unidade?.id !== id ? <Carregando texto="Montando o painel da unidade…" /> : null}
      {unidade?.id === id && resumo && f && !erroCarga ? (
        <>
          <header className="grid gap-4 rounded-3xl border border-line bg-white p-5 shadow-sm lg:grid-cols-[1fr_24rem]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Acompanhamento do Franqueado</p>
              <h1 className="text-2xl font-black">{unidade.nome}</h1>
              <p className="text-sm text-ink/60">{unidade.cidade} · responsável {unidade.responsavel || '—'} · {unidade.email}</p>
              <div className="mt-3"><SaudeSelo nivel={saude} grande /></div>
            </div>
            <ListaSinais sinais={sinais} />
          </header>
          {fontesComFalha.length ? (
            <Aviso tom="info">
              <div role="status">
                <p><span className="font-semibold">Fontes indisponíveis:</span> {fontesComFalha.join(', ')}.</p>
                {motivo.sinaisIndisponiveis.length ? <p><span className="font-semibold">Sinais indisponíveis:</span> {motivo.sinaisIndisponiveis.join(', ')}.</p> : null}
              </div>
              <Button variant="ghost" disabled={carregando} onClick={recarregar}>{carregando ? 'Recarregando…' : 'Tentar novamente'}</Button>
            </Aviso>
          ) : null}
          <CriteriosSaude />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Cartao titulo="Checklist operacional" estados={resumo.checklist.aplica ? [resumo.estados.modelosChecklist, resumo.estados.execucoes] : []}>
              {!resumo.checklist.aplica ? <span className="text-ink/55">Unidade sem o módulo de checklist.</span> : null}
              {resumo.checklist.aplica ? (
                <div className="flex items-center gap-6">
                  <div>{resumo.checklist.media !== null ? <ScoreSelo score={resumo.checklist.media} grande /> : <span className="text-ink/45">sem dados</span>}<p className="text-[11px] text-ink/55">média 30 dias (recalculada)</p></div>
                  <Numero valor={resumo.checklist.execucoes} rotulo="checklists em 30 dias" />
                  <Numero valor={resumo.checklist.atrasados} rotulo="rotinas atrasadas" alerta={(resumo.checklist.atrasados ?? 0) > 0} />
                </div>
              ) : null}
            </Cartao>
            <Cartao titulo="Auditoria e qualidade" estados={[resumo.estados.auditorias, resumo.estados.acoes]}>
              {acoes ? (
                <div className="space-y-2">
                  {ultima ? (
                    <p className="flex flex-wrap items-center gap-2">
                      <Link to={`/auditorias/${ultima.id}`} className="font-semibold text-brand-dark hover:underline">{ultima.modeloTitulo}</Link>
                      <span className="text-ink/55">{formatarDia(ultima.dataVisitaMs)}</span>
                      <ScoreSelo score={ultima.score} /> <ResultadoSelo resultado={ultima.resultado} />
                    </p>
                  ) : <p className="text-ink/55">Nenhuma auditoria assinada.</p>}
                  <div className="flex gap-6">
                    <Numero valor={acoes.abertas} rotulo="ações em aberto" />
                    <Numero valor={acoes.atrasadas} rotulo="atrasadas" alerta={acoes.atrasadas > 0} />
                    <Numero valor={acoes.paraValidar} rotulo="para validar" />
                  </div>
                </div>
              ) : null}
            </Cartao>
            <Cartao titulo="Chamados" estados={[resumo.estados.chamados]}>
              {resumo.chamados ? (
                <div className="flex gap-6">
                  <Numero valor={resumo.chamados.abertos} rotulo="em aberto" />
                  <Numero valor={resumo.chamados.slaEstourado} rotulo="SLA estourado" alerta={resumo.chamados.slaEstourado > 0} />
                  <Numero valor={resumo.chamados.aguardandoUnidade} rotulo="aguardando a unidade" />
                </div>
              ) : null}
            </Cartao>
            <Cartao titulo="Universidade UBOX" estados={[resumo.estados.tentativas, resumo.estados.cursosPublicados]}>
              {resumo.universidade ? (
                <div className="flex gap-6">
                  <Numero valor={resumo.universidade.certificados} rotulo="cursos aprovados (certificados)" />
                  <Numero valor={resumo.universidade.pendentes} rotulo="pendentes (sem aprovação)" alerta={resumo.universidade.pendentes > 0} />
                  <Numero valor={resumo.universidade.pessoas} rotulo={`pessoas · ${resumo.universidade.cursosPublicados ?? '—'} cursos publicados`} />
                </div>
              ) : null}
            </Cartao>
            <Cartao titulo="Trilha de manuais" estados={[resumo.estados.progresso, resumo.estados.trilhaManuais]}>
              {resumo.manuais ? (
                <div className="flex gap-6">
                  <Numero valor={resumo.manuais.percentual === null ? '—' : `${resumo.manuais.percentual}%`} rotulo={`da trilha (${resumo.manuais.trilha ?? '—'} manuais × ${resumo.manuais.pessoas} pessoas)`} />
                  <Numero valor={resumo.manuais.concluidos} rotulo="manuais concluídos" />
                  <Numero valor={resumo.manuais.emAndamento} rotulo="em andamento" />
                </div>
              ) : null}
            </Cartao>
            <Cartao titulo="Pedidos de marketing" estados={[resumo.estados.pedidos]}>
              {resumo.marketing ? (
                <div className="flex gap-6">
                  <Numero valor={resumo.marketing.abertos} rotulo="em aberto" />
                  <Numero valor={resumo.marketing.aguardandoUnidade} rotulo="aguardando a unidade" alerta={resumo.marketing.aguardandoUnidade > 0} />
                  <Numero valor={resumo.marketing.entregues} rotulo="entregues" />
                </div>
              ) : null}
            </Cartao>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Visitas, reuniões e calls</h2>
              <Button type="button" variant="secondary" disabled={salvando || carregando || registrosIndisponiveis} onClick={() => { setEditando(null); setForm(formVazio()); setOk('') }}><Plus className="h-4 w-4" aria-hidden="true" /> Novo registro</Button>
            </div>
            {registrosIndisponiveis ? <Aviso tom="info">Dados indisponíveis — a consulta falhou.</Aviso> : null}
            {form && !registrosIndisponiveis ? (
              <div className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
                <h3 className="font-bold">{editando ? 'Editar registro' : 'Novo registro'}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Tipo">
                    <select className={inputClass} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as RegistroForm['tipo'] })}>
                      {TIPOS_REGISTRO.map((t) => <option key={t} value={t}>{ROTULO_TIPO_REG[t]}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Data"><input type="date" className={inputClass} value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></Campo>
                </div>
                <Campo label="Notas"><textarea className={inputClass} rows={4} maxLength={4000} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></Campo>
                <fieldset className="space-y-2 rounded-2xl border border-line p-3">
                  <legend className="px-1 text-sm font-semibold">{editando ? 'Novos próximos passos combinados' : 'Próximos passos combinados'}</legend>
                  {form.passos.map((p, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem_10rem_auto]">
                      <input className={inputClass} maxLength={1000} placeholder="O que foi combinado" aria-label={`Passo ${i + 1}`} value={p.descricao} onChange={(e) => mudarPasso(i, { descricao: e.target.value })} />
                      <input className={inputClass} maxLength={120} placeholder="Responsável" aria-label={`Responsável do passo ${i + 1}`} value={p.responsavel} onChange={(e) => mudarPasso(i, { responsavel: e.target.value })} />
                      <input type="date" className={inputClass} aria-label={`Prazo do passo ${i + 1}`} value={p.prazo} onChange={(e) => mudarPasso(i, { prazo: e.target.value })} />
                      <button type="button" className="rounded-lg p-2 text-red-600 hover:bg-paper" aria-label={`Remover passo ${i + 1}`} onClick={() => setForm({ ...form, passos: form.passos.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" onClick={() => setForm({ ...form, passos: [...form.passos, { descricao: '', responsavel: unidade.responsavel, prazo: '' }] })}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar passo</Button>
                </fieldset>
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input type="checkbox" className="mt-1" checked={form.compartilhado} onChange={(e) => setForm({ ...form, compartilhado: e.target.checked })} />
                  <span>Compartilhar com a unidade <span className="block text-xs font-normal text-ink/55">O franqueado e a equipe veem as notas e os passos; o franqueado marca os passos como feitos.</span></span>
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={form.geradoPorIA} onChange={(e) => setForm({ ...form, geradoPorIA: e.target.checked })} /> Usei IA para redigir ou resumir as notas
                </label>
                {form.geradoPorIA ? (
                  <Campo label="Qual IA ou modelo" hint="Fica registrado no registro."><input className={inputClass} maxLength={80} value={form.iaModelo} onChange={(e) => setForm({ ...form, iaModelo: e.target.value })} placeholder="Ex.: Gemini, Grok" /></Campo>
                ) : null}
                <div className="flex gap-2">
                  <Button type="button" onClick={() => void gravar()} disabled={salvando || carregando}>{salvando ? 'Salvando…' : 'Salvar registro'}</Button>
                  <Button type="button" variant="secondary" onClick={() => { setForm(null); setEditando(null) }}>Fechar</Button>
                </div>
              </div>
            ) : null}
            {!registrosIndisponiveis && !dados?.registros.length ? <Vazio titulo="Nenhum registro ainda" texto="Registre a primeira visita, reunião ou call com esta unidade." /> : null}
            <ul className="space-y-3">
              {!registrosIndisponiveis && dados?.registros.map((r) => {
                const passos = dados.passos.filter((p) => p.registroId === r.id)
                return (
                  <li key={r.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Selo tom="marca">{ROTULO_TIPO_REG[r.tipo]}</Selo>
                        <span className="text-sm font-semibold">{formatarDia(r.dataMs)}</span>
                        <span className="text-xs text-ink/50">por {r.autorNome}</span>
                        {r.compartilhado ? <Selo tom="lima"><Share2 className="mr-1 inline h-3 w-3" aria-hidden="true" />Compartilhado</Selo> : <Selo>Interno</Selo>}
                        {r.geradoPorIA ? <Selo>IA: {r.iaModelo}</Selo> : null}
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand-dark hover:underline"
                        disabled={salvando || carregando}
                        onClick={() => { setEditando(r); setForm({ tipo: r.tipo, data: paraInput(r.dataMs), notas: r.notas, compartilhado: r.compartilhado, geradoPorIA: r.geradoPorIA, iaModelo: r.iaModelo, passos: [] }); setOk('') }}
                      >
                        Editar
                      </button>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm">{r.notas}</p>
                    {passos.length ? (
                      <ul className="mt-3 space-y-2 border-t border-line pt-3">
                        {passos.map((p) => (
                          <li key={p.id} className="rounded-xl bg-paper p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold">{p.descricao}</p>
                                <p className="text-xs text-ink/55">Responsável {p.responsavel} · prazo {formatarDia(p.prazoMs)} · atualizado por {p.atualizadoPorNome} em {formatarData(p.atualizadoEmMs)}</p>
                              </div>
                              <StatusPassoSelo status={p.status} prazoMs={p.prazoMs} />
                            </div>
                            {p.comentarioUnidade ? <p className="mt-1 text-sm"><span className="font-semibold">Unidade:</span> {p.comentarioUnidade}</p> : null}
                            {p.comentarioFranqueadora ? <p className="mt-1 text-sm"><span className="font-semibold">Franqueadora:</span> {p.comentarioFranqueadora}</p> : null}
                            {p.status === 'concluido_unidade' ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <input className={cx(inputClass, 'max-w-md flex-1 py-1.5')} maxLength={1000} placeholder="Comentário (obrigatório para reabrir)" aria-label="Comentário da franqueadora" value={comentarios[p.id] ?? ''} onChange={(e) => setComentarios({ ...comentarios, [p.id]: e.target.value })} />
                                <Button type="button" onClick={() => void decidir(p, 'validado')} disabled={salvando || carregando}>Validar</Button>
                                <Button type="button" variant="danger" onClick={() => void decidir(p, 'reaberto')} disabled={salvando || carregando}>Reabrir</Button>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  )
}
