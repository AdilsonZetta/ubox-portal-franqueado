import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Vazio, cx, inputClass } from '../../components/ui'
import { mensagemErro } from '../../lib/errors'
import { formatarDia } from '../../lib/format'
import { formatarReais, hojeISO, kpisClientes, resumoCobrancas, validarCliente, type ClienteForm } from '../../lib/cliente'
import { criarCliente } from '../../lib/clienteApi'
import { Numero, RodapeModulo12, SituacaoSelo, useClientes, type UsoClientes } from './partes'

export function ClientesPage() {
  const dados = useClientes()
  const [novo, setNovo] = useState(false)
  const [busca, setBusca] = useState('')
  const [encerrados, setEncerrados] = useState(false)
  const hoje = useMemo(() => hojeISO(), [])
  const k = kpisClientes(dados.clientes, dados.paineis, hoje)
  const lista = dados.clientes.filter((c) => (encerrados || c.status === 'ativo')
    && (!busca.trim() || `${c.nome} ${c.box} ${c.telefone}`.toLowerCase().includes(busca.trim().toLowerCase())))

  if (!dados.carregando && !dados.participa) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Vazio titulo="Painel do Cliente é da unidade" texto="Os cadastros e contratos dos locatários ficam só com a unidade (franqueado e equipe com o módulo). A franqueadora, inclusive o admin e a simulação, não acessa estes dados." />
        <RodapeModulo12 />
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

      {dados.erro ? <Aviso tom="erro">{dados.erro}</Aviso> : null}
      {novo ? <NovoCliente dados={dados} onFechar={() => setNovo(false)} /> : null}
      {dados.carregando ? <Carregando texto="Carregando os clientes…" /> : (
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
            </div>
            {lista.length === 0 ? <Vazio titulo="Nenhum cliente aqui" texto="Cadastre o primeiro locatário em “Novo cliente”." /> : (
              <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Box</th><th className="px-4 py-2">Contrato</th><th className="px-4 py-2 text-right">Mensalidade</th><th className="px-4 py-2">Cobrança</th><th className="px-4 py-2">Link</th></tr>
                  </thead>
                  <tbody>
                    {lista.map((c) => {
                      const p = dados.paineis.get(c.id)
                      const r = p ? resumoCobrancas(p.cobrancas, hoje) : null
                      return (
                        <tr key={c.id} className={cx('border-t border-line', c.status === 'encerrado' && 'opacity-60')}>
                          <td className="px-4 py-2"><Link to={`/clientes/${c.id}`} className="font-semibold text-ink hover:text-brand-dark hover:underline">{c.nome}</Link><p className="text-xs text-ink/50">{c.telefone || 'sem telefone'}</p></td>
                          <td className="px-4 py-2">{c.box}</td>
                          <td className="px-4 py-2 text-xs">{formatarDia(c.contratoInicioMs)}{c.contratoFimMs ? ` a ${formatarDia(c.contratoFimMs)}` : ' · sem prazo'}{c.status === 'encerrado' ? ' · encerrado' : ''}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatarReais(c.valorMensalCentavos)}</td>
                          <td className="px-4 py-2">{r ? (r.atrasadas ? <SituacaoSelo s="atrasado" /> : r.proxima ? <SituacaoSelo s="pendente" /> : <span className="text-xs text-ink/50">em dia</span>) : null}</td>
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
      <RodapeModulo12 />
    </div>
  )
}

export const FORM_VAZIO: ClienteForm = { nome: '', telefone: '', email: '', box: '', contratoInicio: hojeISO(), contratoFim: '', valorMensal: '', diaVencimento: '10', obs: '' }

export function CamposCliente({ f, setF }: { f: ClienteForm; setF: (f: ClienteForm) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Campo label="Nome completo"><input className={inputClass} maxLength={120} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
      <Campo label="Telefone"><input className={inputClass} maxLength={30} value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></Campo>
      <Campo label="E-mail (opcional)"><input className={inputClass} maxLength={120} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
      <Campo label="Box"><input className={inputClass} maxLength={60} placeholder="Ex.: Box 12 (6 m²)" value={f.box} onChange={(e) => setF({ ...f, box: e.target.value })} /></Campo>
      <Campo label="Início do contrato"><input className={inputClass} type="date" value={f.contratoInicio} onChange={(e) => setF({ ...f, contratoInicio: e.target.value })} /></Campo>
      <Campo label="Fim do contrato (opcional)"><input className={inputClass} type="date" value={f.contratoFim} onChange={(e) => setF({ ...f, contratoFim: e.target.value })} /></Campo>
      <Campo label="Mensalidade (R$)"><input className={inputClass} inputMode="decimal" placeholder="289,90" value={f.valorMensal} onChange={(e) => setF({ ...f, valorMensal: e.target.value })} /></Campo>
      <Campo label="Dia de vencimento"><input className={inputClass} type="number" min={1} max={28} value={f.diaVencimento} onChange={(e) => setF({ ...f, diaVencimento: e.target.value })} /></Campo>
      <Campo label="Observação interna (não vai para o cliente)"><input className={inputClass} maxLength={1000} value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} /></Campo>
    </div>
  )
}

function NovoCliente({ dados, onFechar }: { dados: UsoClientes; onFechar: () => void }) {
  const navigate = useNavigate()
  const [f, setF] = useState<ClienteForm>(FORM_VAZIO)
  const [contato, setContato] = useState(() => [...dados.paineis.values()].find((p) => p.contatoUnidade)?.contatoUnidade ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function gravar() {
    if (!dados.pessoa) return
    const erros = validarCliente(f)
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
      <CamposCliente f={f} setF={setF} />
      <Campo label="Contato da unidade (aparece no link do cliente)"><input className={inputClass} maxLength={120} placeholder="Ex.: WhatsApp (34) 3333-0000" value={contato} onChange={(e) => setContato(e.target.value)} /></Campo>
      <p className="text-xs text-ink/55">O link do cliente nasce desativado; ative quando for enviar.</p>
      <div className="flex gap-2">
        <Button type="button" onClick={() => void gravar()} disabled={salvando}>{salvando ? 'Salvando…' : 'Cadastrar e abrir'}</Button>
        <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
      </div>
    </section>
  )
}
