import { cpfValido, normalizarCpf } from '../../../supabase/functions/_shared/cpf'
import { AVISO_ASAAS, consultarCpfAsaas } from '../../lib/asaasUnidade'
import { BACKEND } from '../../lib/backend'
import { normalizar } from '../../lib/text'
import { BotaoCsv } from '../../components/BotaoCsv'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Vazio, cx, inputClass } from '../../components/ui'
import { mensagemErro } from '../../lib/errors'
import { formatarDia } from '../../lib/format'
import { ROTULO_RESUMO, estadoResumo, formatarReais, hojeISO, kpisClientes, resumoCobrancas, validarCliente, type ClienteForm } from '../../lib/cliente'
import { criarCliente } from '../../lib/clienteApi'
import { Numero, SituacaoSelo, useClientes, type UsoClientes } from './partes'

export function ClientesPage() {
  const dados = useClientes()
  const [novo, setNovo] = useState(false)
  const [busca, setBusca] = useState('')
  const [encerrados, setEncerrados] = useState(false)
  const [soAtrasados, setSoAtrasados] = useState(false)
  const [ordem, setOrdem] = useState('nome')
  const hoje = useMemo(() => hojeISO(), [])
  const k = kpisClientes(dados.clientes, dados.paineis, dados.cobrancas, hoje)
  const consulta = normalizar(busca.trim())
  const lista = dados.clientes
    .filter((c) => (encerrados || c.status === 'ativo') && normalizar(`${c.nome} ${c.box} ${c.telefone}`).includes(consulta))
    .map((c) => {
      const historico = dados.cobrancas.get(c.id) ?? []
      const ativo = c.status === 'ativo'
      return { c, cobranca: ativo ? resumoCobrancas(historico, hoje) : null, estado: ativo ? estadoResumo(historico, hoje) : null }
    })
    .filter(({ cobranca }) => !soAtrasados || Boolean(cobranca?.atrasadas))
    .sort((a, b) => (ordem === 'atraso' ? (b.cobranca?.atrasadas ?? 0) - (a.cobranca?.atrasadas ?? 0) : 0)
      || a.c.nome.localeCompare(b.c.nome, 'pt-BR'))

  if (!dados.participa) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Vazio titulo="Painel do Cliente é da unidade" texto="Os cadastros e contratos dos locatários ficam só com a unidade (franqueado e equipe com o módulo). A franqueadora, inclusive o admin e a simulação, não acessa estes dados." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Painel do Cliente · {dados.pessoa?.unidade || 'Unidade'}</p>
          <h1 className="text-2xl font-black text-ink">Clientes e contratos</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-ink/65">Contrato, cobranças, visitas e recados de cada locatário. Cada cliente tem um link secreto para acompanhar tudo pelo celular, sem senha; telefone, e-mail e sobrenome não aparecem nele.</p>
        </div>
        <Button type="button" onClick={() => setNovo(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo cliente</Button>
      </header>

      {dados.erro ? <div className="space-y-2"><Aviso tom="erro">Não foi possível carregar os clientes.</Aviso><Button type="button" variant="secondary" onClick={dados.recarregar}>Tentar novamente</Button></div> : null}
      {novo ? <NovoCliente dados={dados} onFechar={() => setNovo(false)} /> : null}
      {dados.carregando ? <Carregando texto="Carregando os clientes…" /> : dados.erro ? null : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Numero rotulo="Clientes ativos" valor={String(k.ativos)} dica={`${k.linksAtivos} com link ativo`} />
            <Numero rotulo="Receita mensal contratada" valor={formatarReais(k.receitaMensalCentavos)} dica="soma das mensalidades ativas" />
            <Numero rotulo="Em atraso" valor={formatarReais(k.atrasadoCentavos)} dica={`${k.clientesEmAtraso} cliente(s)`} alerta={k.atrasadoCentavos > 0} />
            <Numero rotulo="Cadastros" valor={String(dados.clientes.length)} dica="inclui encerrados" />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block min-w-60 flex-1 sm:flex-none"><span className="mb-1 block text-sm font-semibold">Buscar</span>
                <input className={inputClass} placeholder="Nome, box ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={encerrados} onChange={(e) => setEncerrados(e.target.checked)} /> Mostrar encerrados</label>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={soAtrasados} onChange={(e) => setSoAtrasados(e.target.checked)} /> Somente em atraso</label>
              <Campo label="Ordenar por">
                <select className={inputClass} value={ordem} onChange={(e) => setOrdem(e.target.value)}>
                  <option value="nome">Nome</option>
                  <option value="atraso">Mais cobranças em atraso</option>
                </select>
              </Campo>
              {dados.participa ? <BotaoCsv arquivo="clientes" cabecalhos={['Cliente', 'Telefone', 'Box', 'Contrato', 'Cobrança']}
                linhas={lista.map(({ c, estado }) => [c.nome, c.telefone, c.box, c.status === 'ativo' ? 'Ativo' : 'Encerrado',
                  estado ? ROTULO_RESUMO[estado] : null])} /> : null}
            </div>
            {lista.length === 0 ? <Vazio titulo={dados.clientes.length ? 'Nenhum resultado para este filtro' : 'Nenhum cliente aqui'} texto={dados.clientes.length ? 'Ajuste a busca ou os filtros.' : 'Cadastre o primeiro locatário em “Novo cliente”.'} /> : (
              <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Box</th><th className="px-4 py-2">Contrato</th><th className="px-4 py-2 text-right">Mensalidade</th><th className="px-4 py-2">Cobrança</th><th className="px-4 py-2">Link</th></tr>
                  </thead>
                  <tbody>
                    {lista.map(({ c, estado }) => {
                      const p = dados.paineis.get(c.id)
                      return (
                        <tr key={c.id} className={cx('border-t border-line', c.status === 'encerrado' && 'opacity-60')}>
                          <td className="px-4 py-2"><Link to={`/clientes/${c.id}`} className="font-semibold text-ink hover:text-brand-dark hover:underline">{c.nome}</Link><p className="text-xs text-ink/50">{c.telefone || 'sem telefone'}</p></td>
                          <td className="px-4 py-2">{c.box}</td>
                          <td className="px-4 py-2 text-xs">{formatarDia(c.contratoInicioMs)}{c.contratoFimMs ? ` a ${formatarDia(c.contratoFimMs)}` : ' · sem prazo'}{c.status === 'encerrado' ? ' · encerrado' : ''}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatarReais(c.valorMensalCentavos)}</td>
                          <td className="px-4 py-2">{estado === 'em_atraso' ? <SituacaoSelo s="atrasado" /> : estado === 'pendente' ? <SituacaoSelo s="pendente" /> : estado ? <span className="text-xs text-ink-soft">{ROTULO_RESUMO[estado]}</span> : null}</td>
                          <td className="px-4 py-2 text-xs">{p?.ativo ? <span className="font-semibold text-lime-700">ativo</span> : <span className="text-ink/45">desativado</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export const FORM_VAZIO: ClienteForm = { nome: '', telefone: '', email: '', box: '', contratoInicio: hojeISO(), contratoFim: '', valorMensal: '', diaVencimento: '10', obs: '' }

export function CamposCliente({ f, setF, unidadeId, setConsultandoCpf }: {
  f: ClienteForm
  setF: (atualizar: (form: ClienteForm) => ClienteForm) => void
  unidadeId?: string
  setConsultandoCpf: (consultando: boolean) => void
}) {
  const busca = useRef(0)
  const [aviso, setAviso] = useState('')
  useEffect(() => () => { busca.current++ }, [])
  const campo = (patch: Partial<ClienteForm>) => setF((atual) => ({ ...atual, ...patch }))

  async function buscarCpf() {
    const cpf = f.cpf ?? ''
    if (!unidadeId || !cpfValido(cpf) || f.asaasCustomerId) return
    const pedido = ++busca.current
    setConsultandoCpf(true)
    const retorno = await consultarCpfAsaas(unidadeId, normalizarCpf(cpf))
    if (pedido !== busca.current) return
    setConsultandoCpf(false)
    if (!retorno) { setAviso(AVISO_ASAAS); return }
    if (!retorno.encontrado) return
    setF((atual) => atual.cpf !== cpf ? atual : {
      ...atual,
      asaasCustomerId: retorno.asaas_customer_id ?? '',
      nome: atual.nome || retorno.nome || '',
      email: atual.email || retorno.email || '',
      telefone: atual.telefone || retorno.telefone || '',
    })
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {BACKEND === 'supabase' && <Campo label="CPF">
        <input className={inputClass} inputMode="numeric" maxLength={14} required value={f.cpf ?? ''}
          onBlur={() => void buscarCpf()} onChange={(e) => {
            busca.current++
            setConsultandoCpf(false)
            setAviso('')
            campo({ cpf: e.target.value, asaasCustomerId: normalizarCpf(e.target.value) === normalizarCpf(f.cpf ?? '') ? f.asaasCustomerId : '' })
          }} />
      </Campo>}
      {aviso && <div className="sm:col-span-2 lg:col-span-3"><Aviso tom="info">{aviso}</Aviso></div>}
      <Campo label="Nome completo"><input className={inputClass} maxLength={120} value={f.nome} onChange={(e) => campo({ nome: e.target.value })} /></Campo>
      <Campo label="Telefone (opcional)"><input className={inputClass} maxLength={30} value={f.telefone} onChange={(e) => campo({ telefone: e.target.value })} /></Campo>
      <Campo label="E-mail (opcional)"><input className={inputClass} maxLength={120} value={f.email} onChange={(e) => campo({ email: e.target.value })} /></Campo>
      <Campo label="Box"><input className={inputClass} maxLength={60} placeholder="Ex.: Box 12 (6 m²)" value={f.box} onChange={(e) => campo({ box: e.target.value })} /></Campo>
      <Campo label="Início do contrato"><input className={inputClass} type="date" value={f.contratoInicio} onChange={(e) => campo({ contratoInicio: e.target.value })} /></Campo>
      <Campo label="Fim do contrato (opcional)"><input className={inputClass} type="date" value={f.contratoFim} onChange={(e) => campo({ contratoFim: e.target.value })} /></Campo>
      <Campo label="Mensalidade (R$)"><input className={inputClass} inputMode="decimal" placeholder="289,90" value={f.valorMensal} onChange={(e) => campo({ valorMensal: e.target.value })} /></Campo>
      <Campo label="Dia de vencimento"><input className={inputClass} type="number" min={1} max={28} value={f.diaVencimento} onChange={(e) => campo({ diaVencimento: e.target.value })} /></Campo>
      <Campo label="Observação interna (não vai para o cliente)"><input className={inputClass} maxLength={1000} value={f.obs} onChange={(e) => campo({ obs: e.target.value })} /></Campo>
    </div>
  )
}

function NovoCliente({ dados, onFechar }: { dados: UsoClientes; onFechar: () => void }) {
  const navigate = useNavigate()
  const [f, setF] = useState<ClienteForm>(FORM_VAZIO)
  const [contato, setContato] = useState(() => [...dados.paineis.values()].find((p) => p.contatoUnidade)?.contatoUnidade ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [consultandoCpf, setConsultandoCpf] = useState(false)

  async function gravar() {
    if (salvando || consultandoCpf) return
    if (!dados.pessoa) return
    const erros = validarCliente(f, BACKEND === 'supabase')
    if (erros.length) { setErro(erros.join(' ')); return }
    setSalvando(true)
    setErro('')
    try {
      const id = await criarCliente(dados.pessoa, f, contato)
      navigate(`/clientes/${id}`)
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
      setSalvando(false)
    }
  }

  return (
    <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Novo cliente</h2>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <CamposCliente f={f} setF={setF} unidadeId={dados.pessoa?.unidadeId ?? undefined} setConsultandoCpf={setConsultandoCpf} />
      <Campo label="Contato da unidade (aparece no link do cliente)"><input className={inputClass} maxLength={120} placeholder="Ex.: WhatsApp (34) 3333-0000" value={contato} onChange={(e) => setContato(e.target.value)} /></Campo>
      <p className="text-xs text-ink/55">O link do cliente nasce desativado; ative quando for enviar.</p>
      <div className="flex gap-2">
        <Button type="button" onClick={() => void gravar()} disabled={salvando || consultandoCpf}>{salvando ? 'Salvando…' : consultandoCpf ? 'Consultando CPF…' : 'Cadastrar e abrir'}</Button>
        <Button type="button" variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
      </div>
    </section>
  )
}
