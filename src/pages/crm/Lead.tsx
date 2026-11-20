import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { mensagemErro } from '../../lib/errors'
import { formatarData, formatarDia } from '../../lib/format'
import {
  ETAPAS,
  ROTULO_ATIVIDADE,
  ROTULO_ETAPA,
  ROTULO_PROPOSTA,
  TIPOS_ATIVIDADE,
  atrasado,
  fechado,
  formatarReais,
  validarContato,
  validarProposta,
  type Atividade,
  type Etapa,
  type Proposta,
  type TipoAtividade,
} from '../../lib/crm'
import { type ContatoEditavel, atualizarLead, carregarDetalhe, criarProposta, mudarStatusProposta, registrarAtividade, salvarContato } from '../../lib/crmApi'
import { EtapaSelo, RodapeModulo11, useCrm, useResponsaveis } from './partes'

const dia = (ms: number) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : '')

export function LeadPage() {
  const { id = '' } = useParams()
  const dados = useCrm()
  const lead = dados.leads.find((l) => l.id === id) ?? null
  const contato = dados.contatos.get(id) ?? null
  const responsaveis = useResponsaveis(dados.pessoa, dados.leads)
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [tique, setTique] = useState(0)
  const [motivo, setMotivo] = useState('')
  const [editContato, setEditContato] = useState<ContatoEditavel | null>(null)
  const [at, setAt] = useState<{ tipo: TipoAtividade; texto: string; proximo: string; ia: boolean; iaModelo: string }>({ tipo: 'ligacao', texto: '', proximo: '', ia: false, iaModelo: '' })
  const [pr, setPr] = useState({ box: '', preco: '', periodoMeses: 1, validade: dia(Date.now() + 7 * 86_400_000), obs: '', ia: false, iaModelo: '' })

  const recarregarDetalhe = useCallback(() => setTique((t) => t + 1), [])
  useEffect(() => {
    if (!lead || dados.gestor || dados.simulando) return
    void carregarDetalhe(lead.unidadeId, lead.id).then((d) => { setAtividades(d.atividades); setPropostas(d.propostas) }).catch((f) => setErro(mensagemErro(f)))
  }, [lead?.id, lead?.unidadeId, dados.gestor, dados.simulando, tique]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (contato) setPr((p) => (p.box ? p : { ...p, box: contato.interesseTamanho })) }, [contato])

  if (dados.gestor) return <Navigate to="/crm/gestao" replace />
  if (dados.carregando) return <Carregando texto="Carregando o lead…" />
  if (!lead) return <div className="mx-auto max-w-3xl space-y-3"><Vazio titulo="Lead não encontrado" texto="Ele pode ser de outra unidade ou o link está errado." /><Link className="text-sm font-semibold text-brand-dark" to="/crm">Voltar ao funil</Link></div>

  const pessoa = dados.pessoa
  const bloqueado = dados.simulando || !pessoa
  const aberto = !fechado(lead.etapa)

  async function acao(fn: () => Promise<void>, mensagem: string) {
    setSalvando(true)
    setErro('')
    try {
      await fn()
      setOk(mensagem)
      dados.recarregar()
      recarregarDetalhe()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  function mudarEtapa(etapa: Etapa) {
    if (!pessoa || !lead) return
    if (etapa === 'perdido' && !dados.config.motivosPerda.includes(motivo)) { setErro('Escolha o motivo da perda.'); return }
    void acao(() => atualizarLead(pessoa, lead, { etapa, motivoPerda: motivo }), `Etapa: ${ROTULO_ETAPA[etapa]}.`)
  }

  const atrasadoAgora = atrasado(lead, Date.now())
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link to="/crm" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-dark hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Funil</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Lead · {lead.origem} · criado em {formatarData(lead.criadoEmMs)}</p>
          <h1 className="text-2xl font-black text-ink">{contato?.nome || 'Contato restrito à unidade'}</h1>
          <p className="text-sm text-ink/65">{contato ? ([contato.interesseTamanho, contato.interessePeriodo, contato.interesseUso].filter(Boolean).join(' · ') || 'Interesse não informado') : ''}{lead.valorEstimadoCentavos ? ` · ${formatarReais(lead.valorEstimadoCentavos)}/mês` : ''}</p>
        </div>
        <div className="flex items-center gap-2"><EtapaSelo etapa={lead.etapa} />{lead.arquivado ? <Selo>Arquivado</Selo> : null}</div>
      </header>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Etapa do funil</h2>
            {aberto ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {ETAPAS.filter((e) => e !== 'perdido' && e !== lead.etapa).map((e) => (
                    <Button key={e} type="button" variant={e === 'ganho' ? 'primary' : 'secondary'} disabled={salvando || bloqueado} onClick={() => mudarEtapa(e)}>{ROTULO_ETAPA[e]}</Button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-64">
                    <Campo label="Motivo da perda">
                      <select className={inputClass} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                        <option value="">Escolha…</option>
                        {dados.config.motivosPerda.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </Campo>
                  </div>
                  <Button type="button" variant="danger" disabled={salvando || bloqueado} onClick={() => mudarEtapa('perdido')}>Marcar como perdido</Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink/70">Fechado em {formatarData(lead.fechadoEmMs)}{lead.etapa === 'perdido' ? ` · motivo: ${lead.motivoPerda}` : ''}. Leads fechados não voltam ao funil; cadastre um novo se o cliente retornar.</p>
            )}
            <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
              <Campo label="Responsável">
                <select className={inputClass} value={lead.responsavelUid} disabled={!aberto || salvando || bloqueado}
                  onChange={(e) => { const r = responsaveis.find((x) => x.uid === e.target.value); if (pessoa && r) void acao(() => atualizarLead(pessoa, lead, { responsavelUid: r.uid, responsavelNome: r.nome }), `Responsável: ${r.nome}.`) }}>
                  {responsaveis.map((r) => <option key={r.uid} value={r.uid}>{r.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Próximo contato">
                <input className={cx(inputClass, atrasadoAgora && 'border-red-400')} type="date" value={dia(lead.proximoContatoMs)} disabled={!aberto || salvando || bloqueado}
                  onChange={(e) => { if (pessoa) void acao(() => atualizarLead(pessoa, lead, { proximoContato: e.target.value || null }), e.target.value ? `Retorno agendado para ${formatarDia(new Date(`${e.target.value}T09:00:00`))}.` : 'Retorno removido.') }} />
              </Campo>
            </div>
            {atrasadoAgora ? <p className="text-sm font-semibold text-red-700">Follow-up atrasado desde {formatarDia(lead.proximoContatoMs)}.</p> : null}
            <Button type="button" variant="ghost" disabled={salvando || bloqueado} onClick={() => pessoa && void acao(() => atualizarLead(pessoa, lead, { arquivado: !lead.arquivado }), lead.arquivado ? 'Lead desarquivado.' : 'Lead arquivado (não é apagado).')}>
              {lead.arquivado ? 'Desarquivar' : 'Arquivar lead'}
            </Button>
          </section>

          <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Atividades</h2>
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <Campo label="Tipo">
                <select className={inputClass} value={at.tipo} onChange={(e) => setAt({ ...at, tipo: e.target.value as TipoAtividade })}>
                  {TIPOS_ATIVIDADE.map((t) => <option key={t} value={t}>{ROTULO_ATIVIDADE[t]}</option>)}
                </select>
              </Campo>
              <Campo label="O que aconteceu"><textarea className={inputClass} rows={2} maxLength={2000} value={at.texto} onChange={(e) => setAt({ ...at, texto: e.target.value })} /></Campo>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              {aberto ? <div className="w-44"><Campo label="Novo retorno (opcional)"><input className={inputClass} type="date" value={at.proximo} onChange={(e) => setAt({ ...at, proximo: e.target.value })} /></Campo></div> : null}
              <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" checked={at.ia} onChange={(e) => setAt({ ...at, ia: e.target.checked })} /> Texto escrito com ajuda de IA</label>
              {at.ia ? <div className="w-48"><Campo label="Qual IA / modelo"><input className={inputClass} maxLength={80} value={at.iaModelo} onChange={(e) => setAt({ ...at, iaModelo: e.target.value })} /></Campo></div> : null}
              <Button type="button" disabled={salvando || bloqueado} onClick={() => {
                if (!pessoa) return
                if (at.texto.trim().length < 2) { setErro('Descreva a atividade.'); return }
                if (at.ia && at.iaModelo.trim().length < 2) { setErro('Diga qual IA/modelo ajudou no texto.'); return }
                void acao(async () => {
                  await registrarAtividade(pessoa, lead, at.tipo, at.texto, { geradoPorIA: at.ia, iaModelo: at.iaModelo }, at.proximo ? at.proximo : null)
                  setAt({ tipo: at.tipo, texto: '', proximo: '', ia: false, iaModelo: '' })
                }, 'Atividade registrada.')
              }}>Registrar atividade</Button>
            </div>
            {!atividades.length ? <p className="text-sm text-ink/50">Nenhuma atividade ainda.</p> : (
              <ol className="space-y-2 border-l-2 border-line pl-4">
                {atividades.map((a) => (
                  <li key={a.id} className="text-sm">
                    <p className="text-xs text-ink/50">{formatarData(a.criadoEmMs)} · {ROTULO_ATIVIDADE[a.tipo]} · {a.nome}{a.geradoPorIA ? ` · IA: ${a.iaModelo}` : ''}</p>
                    <p className="whitespace-pre-wrap">{a.texto}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="space-y-2 rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Contato</h2>
            <p className="text-xs text-ink/50">Visível só para a unidade (inclui o interesse do cliente).</p>
            {editContato ? (
              <>
                <Campo label="Nome"><input className={inputClass} maxLength={120} value={editContato.nome} onChange={(e) => setEditContato({ ...editContato, nome: e.target.value })} /></Campo>
                <Campo label="Telefone"><input className={inputClass} maxLength={30} value={editContato.telefone} onChange={(e) => setEditContato({ ...editContato, telefone: e.target.value })} /></Campo>
                <Campo label="E-mail"><input className={inputClass} maxLength={120} value={editContato.email} onChange={(e) => setEditContato({ ...editContato, email: e.target.value })} /></Campo>
                <Campo label="Box / m² de interesse"><input className={inputClass} maxLength={60} value={editContato.interesseTamanho} onChange={(e) => setEditContato({ ...editContato, interesseTamanho: e.target.value })} /></Campo>
                <Campo label="Período"><input className={inputClass} maxLength={60} value={editContato.interessePeriodo} onChange={(e) => setEditContato({ ...editContato, interessePeriodo: e.target.value })} /></Campo>
                <Campo label="Uso"><input className={inputClass} maxLength={200} value={editContato.interesseUso} onChange={(e) => setEditContato({ ...editContato, interesseUso: e.target.value })} /></Campo>
                <div className="flex gap-2">
                  <Button type="button" disabled={salvando} onClick={() => {
                    const erros = validarContato(editContato)
                    if (erros.length) { setErro(erros.join(' ')); return }
                    if (pessoa) void acao(async () => { await salvarContato(pessoa, lead.id, editContato); setEditContato(null) }, 'Contato atualizado.')
                  }}>Salvar</Button>
                  <Button type="button" variant="ghost" onClick={() => setEditContato(null)}>Cancelar</Button>
                </div>
              </>
            ) : contato ? (
              <>
                <p className="text-sm">{contato.telefone || 'sem telefone'}</p>
                <p className="text-sm">{contato.email || 'sem e-mail'}</p>
                <Button type="button" variant="secondary" disabled={bloqueado} onClick={() => { const { id: _id, ...resto } = contato; void _id; setEditContato(resto) }}>Editar contato</Button>
              </>
            ) : <p className="text-sm text-ink/50">Sem acesso aos dados pessoais nesta visão.</p>}
          </section>

          <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Propostas</h2>
            {propostas.map((p) => (
              <article key={p.id} className="space-y-1 rounded-xl border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{p.box}</span><Selo tom={p.status === 'aceita' ? 'lima' : p.status === 'enviada' ? 'alerta' : 'neutro'}>{ROTULO_PROPOSTA[p.status]}</Selo></div>
                <p>{formatarReais(p.precoMensalCentavos)}/mês · {p.periodoMeses} {p.periodoMeses === 1 ? 'mês' : 'meses'} · válida até {formatarDia(p.validadeMs)}</p>
                {p.obs ? <p className="text-xs text-ink/60">{p.obs}</p> : null}
                {p.geradoPorIA ? <p className="text-xs text-ink/45">IA: {p.iaModelo}</p> : null}
                {p.status === 'enviada' && !bloqueado ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(['aceita', 'recusada', 'expirada'] as const).map((s) => (
                      <button key={s} type="button" disabled={salvando} className="rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-paper"
                        onClick={() => pessoa && void acao(() => mudarStatusProposta(pessoa, p, s), `Proposta ${ROTULO_PROPOSTA[s].toLowerCase()}.`)}>{ROTULO_PROPOSTA[s]}</button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            <div className="space-y-2 border-t border-line pt-3">
              <h3 className="text-sm font-bold">Nova proposta</h3>
              <Campo label="Box"><input className={inputClass} maxLength={60} value={pr.box} onChange={(e) => setPr({ ...pr, box: e.target.value })} /></Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Preço/mês (R$)"><input className={inputClass} inputMode="decimal" value={pr.preco} onChange={(e) => setPr({ ...pr, preco: e.target.value })} /></Campo>
                <Campo label="Período (meses)"><input className={inputClass} type="number" min={1} max={120} value={pr.periodoMeses} onChange={(e) => setPr({ ...pr, periodoMeses: Number(e.target.value) })} /></Campo>
              </div>
              <Campo label="Validade"><input className={inputClass} type="date" value={pr.validade} onChange={(e) => setPr({ ...pr, validade: e.target.value })} /></Campo>
              <Campo label="Observação"><textarea className={inputClass} rows={2} maxLength={1000} value={pr.obs} onChange={(e) => setPr({ ...pr, obs: e.target.value })} /></Campo>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pr.ia} onChange={(e) => setPr({ ...pr, ia: e.target.checked })} /> Texto com ajuda de IA</label>
              {pr.ia ? <Campo label="IA / modelo da proposta"><input className={inputClass} maxLength={80} value={pr.iaModelo} onChange={(e) => setPr({ ...pr, iaModelo: e.target.value })} /></Campo> : null}
              <Button type="button" disabled={salvando || bloqueado} onClick={() => {
                const erros = validarProposta(pr.box, pr.preco, pr.periodoMeses, pr.validade, Date.now())
                if (pr.ia && pr.iaModelo.trim().length < 2) erros.push('Diga qual IA/modelo ajudou.')
                if (erros.length) { setErro(erros.join(' ')); return }
                if (pessoa) void acao(async () => {
                  await criarProposta(pessoa, lead, { box: pr.box, preco: pr.preco, periodoMeses: pr.periodoMeses, validade: pr.validade, obs: pr.obs, geradoPorIA: pr.ia, iaModelo: pr.iaModelo })
                  if (lead.etapa !== 'proposta' && aberto) await atualizarLead(pessoa, lead, { etapa: 'proposta' })
                }, 'Proposta registrada; o lead foi para a etapa Proposta.')
              }}>Registrar proposta</Button>
            </div>
          </section>
        </div>
      </div>
      <RodapeModulo11 />
    </div>
  )
}
