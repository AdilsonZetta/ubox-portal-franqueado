import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Vazio, cx, inputClass } from '../../components/ui'
import { mensagemErro } from '../../lib/errors'
import { formatarDia } from '../../lib/format'
import {
  ETAPAS,
  ETAPAS_ABERTAS,
  ROTULO_ETAPA,
  atrasado,
  calcularKpis,
  followUps,
  formatarReais,
  porEtapa,
  validarLead,
  type Contato,
  type Etapa,
  type Lead,
  type LeadForm,
} from '../../lib/crm'
import { atualizarLead, criarLead } from '../../lib/crmApi'
import { Barra, EtapaSelo, Numero, RodapeModulo11, useCrm, useResponsaveis, type UsoCrm } from './partes'

type Aba = 'funil' | 'followups' | 'painel'
const ROTULO_ABA: Record<Aba, string> = { funil: 'Funil', followups: 'Follow-ups', painel: 'Painel' }
const DIA = 86_400_000

export function CrmPage() {
  const dados = useCrm()
  const [params, setParams] = useSearchParams()
  const aba = (Object.keys(ROTULO_ABA).includes(params.get('aba') ?? '') ? params.get('aba') : 'funil') as Aba
  const [novo, setNovo] = useState(false)
  const [ok, setOk] = useState('')
  const agora = useMemo(() => Date.now(), [dados.leads])
  const fu = followUps(dados.leads, agora)

  if (dados.gestor) return <Navigate to="/crm/gestao" replace />
  if (!dados.carregando && !dados.participa) return <Navigate to="/" replace />

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">CRM e Gestão Comercial · {dados.pessoa?.unidade || 'Unidade'}</p>
          <h1 className="text-2xl font-black text-ink">Funil de locação</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-ink/65">Leads de boxes da unidade, do primeiro contato ao contrato fechado. Telefone e e-mail dos clientes ficam só com a unidade.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Seções do CRM">
            {(Object.keys(ROTULO_ABA) as Aba[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={aba === item} onClick={() => { setParams({ aba: item }); setOk('') }}
                className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', aba === item ? 'bg-ink text-white' : 'text-ink/60 hover:text-ink')}>
                {ROTULO_ABA[item]}{item === 'followups' && fu.atrasados.length ? <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[11px] text-white">{fu.atrasados.length}</span> : null}
              </button>
            ))}
          </div>
          <Button type="button" onClick={() => { setNovo(true); setOk('') }} disabled={dados.simulando}><Plus className="h-4 w-4" aria-hidden="true" /> Novo lead</Button>
        </div>
      </header>

      {dados.simulando ? <Aviso>Na simulação, o admin vê só os campos sem dados pessoais e não grava nada.</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {dados.erro ? <Aviso tom="erro">{dados.erro}</Aviso> : null}
      {dados.carregando ? <Carregando texto="Carregando o funil…" /> : null}
      {novo ? <NovoLead dados={dados} onFechar={() => setNovo(false)} onFeito={(m) => { setNovo(false); setOk(m); dados.recarregar() }} /> : null}

      {!dados.carregando && aba === 'funil' ? <Kanban dados={dados} agora={agora} onFeito={(m) => { setOk(m); dados.recarregar() }} /> : null}
      {!dados.carregando && aba === 'followups' ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <ListaFollowUp titulo="Atrasados" vazio="Nenhum follow-up atrasado." leads={fu.atrasados} contatos={dados.contatos} tom="erro" />
          <ListaFollowUp titulo="Para hoje" vazio="Nada agendado para hoje." leads={fu.hoje} contatos={dados.contatos} />
          <ListaFollowUp titulo="Sem próximo contato" vazio="Todo lead aberto tem data de retorno." leads={fu.semData} contatos={dados.contatos} />
        </section>
      ) : null}
      {!dados.carregando && aba === 'painel' ? <Painel leads={dados.leads} agora={agora} /> : null}
      <RodapeModulo11 />
    </div>
  )
}

function nomeDo(contatos: Map<string, Contato>, lead: Lead) {
  return contatos.get(lead.id)?.nome || 'Contato restrito à unidade'
}

function Kanban({ dados, agora, onFeito }: { dados: UsoCrm; agora: number; onFeito: (m: string) => void }) {
  const [mostrarArquivados, setMostrarArquivados] = useState(false)
  const [mostrarFechados, setMostrarFechados] = useState(true)
  const [responsavel, setResponsavel] = useState('')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const responsaveis = useResponsaveis(dados.pessoa, dados.leads)
  const filtrados = dados.leads.filter((l) => (!responsavel || l.responsavelUid === responsavel)
    && (!busca.trim() || `${nomeDo(dados.contatos, l)} ${dados.contatos.get(l.id)?.interesseTamanho ?? ''} ${l.origem}`.toLowerCase().includes(busca.trim().toLowerCase())))
  const grupos = porEtapa(filtrados, mostrarArquivados)
  const colunas = mostrarFechados ? ETAPAS : ETAPAS_ABERTAS

  async function avancar(l: Lead, etapa: Etapa) {
    if (!dados.pessoa) return
    setErro('')
    try {
      await atualizarLead(dados.pessoa, l, { etapa })
      onFeito(`${nomeDo(dados.contatos, l)} → ${ROTULO_ETAPA[etapa]}.`)
    } catch (falha) {
      setErro(mensagemErro(falha))
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56"><Campo label="Buscar"><input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, box, origem" /></Campo></div>
        <div className="w-56">
          <Campo label="Responsável">
            <select className={inputClass} value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              <option value="">Toda a unidade</option>
              {responsaveis.map((r) => <option key={r.uid} value={r.uid}>{r.nome}</option>)}
            </select>
          </Campo>
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" checked={mostrarFechados} onChange={(e) => setMostrarFechados(e.target.checked)} /> Mostrar ganhos e perdidos</label>
        <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" checked={mostrarArquivados} onChange={(e) => setMostrarArquivados(e.target.checked)} /> Mostrar arquivados</label>
      </div>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {!dados.leads.length ? <Vazio titulo="Nenhum lead ainda" texto="Cadastre quem pediu orçamento pelo site, Instagram, WhatsApp ou passou na loja." /> : null}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {colunas.map((etapa) => (
          <div key={etapa} className="w-64 shrink-0 space-y-2 rounded-2xl bg-paper/70 p-2.5" aria-label={`Coluna ${ROTULO_ETAPA[etapa]}`}>
            <div className="flex items-center justify-between px-1">
              <EtapaSelo etapa={etapa} />
              <span className="text-xs font-semibold text-ink/50">{grupos[etapa].length}</span>
            </div>
            {grupos[etapa].map((l) => {
              const idx = ETAPAS_ABERTAS.indexOf(l.etapa)
              const proxima = idx >= 0 && idx < ETAPAS_ABERTAS.length - 1 ? ETAPAS_ABERTAS[idx + 1] : null
              return (
                <article key={l.id} className={cx('space-y-1 rounded-xl border bg-white p-3 text-sm shadow-sm', atrasado(l, agora) ? 'border-red-300' : 'border-line', l.arquivado && 'opacity-60')}>
                  <Link to={`/crm/lead/${l.id}`} className="block font-semibold text-ink hover:text-brand-dark hover:underline">{nomeDo(dados.contatos, l)}</Link>
                  <p className="text-xs text-ink/55">{l.origem}{dados.contatos.get(l.id)?.interesseTamanho ? ` · ${dados.contatos.get(l.id)?.interesseTamanho}` : ''}{l.valorEstimadoCentavos ? ` · ${formatarReais(l.valorEstimadoCentavos)}` : ''}</p>
                  <p className="text-xs text-ink/55">Resp.: {l.responsavelNome}</p>
                  {l.etapa === 'perdido' ? <p className="text-xs text-red-700">Motivo: {l.motivoPerda}</p> : null}
                  {l.proximoContatoMs && !l.arquivado && ETAPAS_ABERTAS.includes(l.etapa) ? (
                    <p className={cx('text-xs', atrasado(l, agora) ? 'font-semibold text-red-700' : 'text-ink/55')}>Retorno: {formatarDia(l.proximoContatoMs)}{atrasado(l, agora) ? ' (atrasado)' : ''}</p>
                  ) : null}
                  {l.arquivado ? <p className="text-xs text-ink/45">Arquivado</p> : null}
                  {proxima && !l.arquivado && !dados.simulando ? (
                    <button type="button" onClick={() => void avancar(l, proxima)} className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-dark hover:underline">
                      Mover para {ROTULO_ETAPA[proxima]} <ChevronRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </article>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

function ListaFollowUp({ titulo, vazio, leads, contatos, tom }: { titulo: string; vazio: string; leads: Lead[]; contatos: Map<string, Contato>; tom?: 'erro' }) {
  return (
    <div className={cx('space-y-2 rounded-2xl border bg-white p-4 shadow-sm', tom === 'erro' && leads.length ? 'border-red-200' : 'border-line')}>
      <h2 className={cx('font-bold', tom === 'erro' && leads.length > 0 && 'text-red-800')}>{titulo} ({leads.length})</h2>
      {!leads.length ? <p className="text-sm text-ink/50">{vazio}</p> : (
        <ul className="divide-y divide-line">
          {leads.map((l) => (
            <li key={l.id} className="py-2 text-sm">
              <Link to={`/crm/lead/${l.id}`} className="font-medium hover:text-brand-dark hover:underline">{nomeDo(contatos, l)}</Link>
              <p className="text-xs text-ink/55">{ROTULO_ETAPA[l.etapa]} · {l.responsavelNome}{l.proximoContatoMs ? ` · ${formatarDia(l.proximoContatoMs)}` : ''}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Painel({ leads, agora }: { leads: Lead[]; agora: number }) {
  const [periodo, setPeriodo] = useState(90)
  const k = calcularKpis(leads, agora, periodo ? agora - periodo * DIA : 0)
  return (
    <section className="space-y-4">
      <div className="w-48">
        <Campo label="Período (leads criados)">
          <select className={inputClass} value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Últimos 12 meses</option>
            <option value={0}>Tudo</option>
          </select>
        </Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Numero rotulo="Leads" valor={String(k.total)} dica={`${k.abertos} em aberto`} />
        <Numero rotulo="Conversão" valor={k.conversao === null ? '—' : `${k.conversao}%`} dica={`${k.ganhos} ganho(s) · ${k.perdidos} perdido(s)`} />
        <Numero rotulo="Tempo até fechar" valor={k.diasParaFechar === null ? '—' : `${k.diasParaFechar.toLocaleString('pt-BR')} dias`} dica="média dos ganhos" />
        <Numero rotulo="Follow-ups atrasados" valor={String(k.atrasados)} />
        <Numero rotulo="Valor ganho (estimado)" valor={formatarReais(k.valorGanhoCentavos)} dica="soma do valor estimado dos ganhos" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
          <h2 className="font-bold">Leads por origem</h2>
          {!k.porOrigem.length ? <p className="text-sm text-ink/50">Sem leads no período.</p> : k.porOrigem.map((o) => <Barra key={o.origem} rotulo={o.origem} valor={o.total} total={k.total} extra={`${o.ganhos} ganho(s)`} />)}
        </div>
        <div className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
          <h2 className="font-bold">Funil por etapa</h2>
          {ETAPAS.map((e) => <Barra key={e} rotulo={ROTULO_ETAPA[e]} valor={k.porEtapa[e]} total={k.total} />)}
        </div>
        <div className="space-y-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
          <h2 className="font-bold">Motivos de perda</h2>
          {!k.motivosPerda.length ? <p className="text-sm text-ink/50">Nenhum lead perdido no período.</p> : k.motivosPerda.map((m) => <Barra key={m.motivo} rotulo={m.motivo} valor={m.total} total={k.perdidos} />)}
        </div>
      </div>
      <p className="text-xs text-ink/50">Conversão = ganhos ÷ (ganhos + perdidos) dos leads criados no período. Tempo até fechar = média de dias entre o cadastro e o fechamento ganho. Arquivados contam no histórico.</p>
    </section>
  )
}

function NovoLead({ dados, onFechar, onFeito }: { dados: UsoCrm; onFechar: () => void; onFeito: (m: string) => void }) {
  const responsaveis = useResponsaveis(dados.pessoa, dados.leads)
  const navigate = useNavigate()
  const [f, setF] = useState<LeadForm>({
    nome: '', telefone: '', email: '', origem: '', interesseTamanho: '', interessePeriodo: '', interesseUso: '', valorEstimado: '',
    responsavelUid: dados.pessoa?.uid ?? '', proximoContato: new Date(Date.now() + DIA).toISOString().slice(0, 10),
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function gravar(abrir: boolean) {
    if (!dados.pessoa) return
    const erros = validarLead(f, dados.config.origens)
    if (erros.length) { setErro(erros.join(' ')); return }
    setSalvando(true)
    setErro('')
    try {
      const nome = responsaveis.find((r) => r.uid === f.responsavelUid)?.nome ?? dados.pessoa.nome
      const id = await criarLead(dados.pessoa, f, nome)
      if (abrir) navigate(`/crm/lead/${id}`)
      else onFeito(`Lead ${f.nome.trim()} cadastrado.`)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Novo lead</h2>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Campo label="Nome do cliente"><input className={inputClass} maxLength={120} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo label="Telefone"><input className={inputClass} maxLength={30} inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></Campo>
        <Campo label="E-mail"><input className={inputClass} maxLength={120} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo label="Origem">
          <select className={inputClass} value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })}>
            <option value="">Escolha…</option>
            {dados.config.origens.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Campo>
        <Campo label="Box / m² de interesse"><input className={inputClass} maxLength={60} placeholder="Ex.: 6 m² ou box M" value={f.interesseTamanho} onChange={(e) => setF({ ...f, interesseTamanho: e.target.value })} /></Campo>
        <Campo label="Período"><input className={inputClass} maxLength={60} placeholder="Ex.: 3 meses" value={f.interessePeriodo} onChange={(e) => setF({ ...f, interessePeriodo: e.target.value })} /></Campo>
        <Campo label="Uso"><input className={inputClass} maxLength={200} placeholder="Ex.: mudança, estoque de loja, documentos" value={f.interesseUso} onChange={(e) => setF({ ...f, interesseUso: e.target.value })} /></Campo>
        <Campo label="Valor estimado/mês (opcional)"><input className={inputClass} inputMode="decimal" placeholder="Ex.: 289,90" value={f.valorEstimado} onChange={(e) => setF({ ...f, valorEstimado: e.target.value })} /></Campo>
        <Campo label="Responsável">
          <select className={inputClass} value={f.responsavelUid} onChange={(e) => setF({ ...f, responsavelUid: e.target.value })}>
            {responsaveis.map((r) => <option key={r.uid} value={r.uid}>{r.nome}</option>)}
          </select>
        </Campo>
        <Campo label="Próximo contato"><input className={inputClass} type="date" value={f.proximoContato} onChange={(e) => setF({ ...f, proximoContato: e.target.value })} /></Campo>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void gravar(false)} disabled={salvando}>{salvando ? 'Salvando…' : 'Cadastrar lead'}</Button>
        <Button type="button" variant="secondary" onClick={() => void gravar(true)} disabled={salvando}>Cadastrar e abrir</Button>
        <Button type="button" variant="ghost" onClick={onFechar}>Fechar</Button>
      </div>
      <p className="text-xs text-ink/50">Nome, telefone e e-mail ficam num registro separado que só a unidade lê; a franqueadora vê apenas números do funil.</p>
    </section>
  )
}
