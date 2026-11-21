import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Aviso, Button, Campo, Carregando, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarDia } from '../../lib/format'
import { listarUnidades } from '../../lib/gestao'
import {
  ROTULO_CAMPANHA,
  ROTULO_STATUS,
  ROTULO_TIPO,
  STATUS_PEDIDO,
  TIPOS_CAMPANHA,
  TIPOS_MATERIAL,
  categoriasDe,
  contarPorStatus,
  inputDaData,
  linkHttpsValido,
  proximosStatusGestor,
  validarMaterial,
  vigencia,
  type MaterialForm,
  type MaterialMkt,
  type PedidoMkt,
  type StatusPedido,
} from '../../lib/marketing'
import { andamentoPedido, salvarCampanha, salvarMaterial, type CampanhaForm } from '../../lib/marketingApi'
import { useVisao } from '../../lib/visao'
import { DetalhePedido } from './Pedidos'
import { useMarketing } from './useMarketing'

type Aba = 'materiais' | 'campanhas' | 'pedidos'
const ROTULO_ABA: Record<Aba, string> = { materiais: 'Materiais', campanhas: 'Campanhas', pedidos: 'Pedidos' }

const materialVazio: MaterialForm = {
  titulo: '', descricao: '', tipo: 'arte', categoria: '', campanhaId: '', url: '', previaUrl: '', formato: '', regrasUso: '',
  validoDe: '', validoAte: '', publico: true, unidades: [], ativo: true, geradoPorIA: false, iaModelo: '',
}
const campanhaVazia: CampanhaForm = { titulo: '', descricao: '', tipo: 'campanha', inicio: '', fim: '', ativo: true, geradoPorIA: false, iaModelo: '' }

function paraForm(m: MaterialMkt): MaterialForm {
  return {
    titulo: m.titulo, descricao: m.descricao, tipo: m.tipo, categoria: m.categoria, campanhaId: m.campanhaId, url: m.url, previaUrl: m.previaUrl,
    formato: m.formato, regrasUso: m.regrasUso, validoDe: inputDaData(m.validoDeMs), validoAte: inputDaData(m.validoAteMs), publico: m.publico,
    unidades: m.unidades, ativo: m.ativo, geradoPorIA: m.geradoPorIA, iaModelo: m.iaModelo,
  }
}

function CamposIA({ ligado, modelo, mudar }: { ligado: boolean; modelo: string; mudar: (ligado: boolean, modelo: string) => void }) {
  return (
    <div className="space-y-2 rounded-2xl border border-line p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={ligado} onChange={(e) => mudar(e.target.checked, modelo)} /> Conteúdo criado ou editado com IA
      </label>
      {ligado ? (
        <Campo label="Qual IA ou modelo participou" hint="Fica registrado e aparece para as unidades.">
          <input className={inputClass} maxLength={80} value={modelo} onChange={(e) => mudar(true, e.target.value)} placeholder="Ex.: Grok Imagine, Gemini, Canva IA" />
        </Campo>
      ) : null}
    </div>
  )
}

export function GestaoMarketingPage() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado } = useVisao()
  const [params, setParams] = useSearchParams()
  const aba = (['materiais', 'campanhas', 'pedidos'].includes(params.get('aba') ?? '') ? params.get('aba') : 'materiais') as Aba
  const dados = useMarketing({ pedidos: true })
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([])
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [materialId, setMaterialId] = useState<string | null>(null)
  const [material, setMaterial] = useState<MaterialForm | null>(null)
  const [campanhaId, setCampanhaId] = useState<string | null>(null)
  const [campanha, setCampanha] = useState<CampanhaForm | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<StatusPedido | 'ativos'>('ativos')
  const [andamento, setAndamento] = useState<Record<string, { status: StatusPedido; resposta: string; entregaUrl: string; geradoPorIA: boolean; iaModelo: string }>>({})
  const agora = Date.now()

  // Admin lê todas as unidades; a equipe da franqueadora usa as unidades que aparecem nos pedidos.
  useEffect(() => {
    if (!ehAdmin) return
    void listarUnidades().then((lista) => setUnidades(lista.map((u) => ({ id: u.id, nome: u.nome })))).catch(() => undefined)
  }, [ehAdmin])
  const opcoesUnidade = useMemo(() => {
    const mapa = new Map(unidades.map((u) => [u.id, u.nome]))
    for (const p of dados.pedidos) if (p.unidadeId && !mapa.has(p.unidadeId)) mapa.set(p.unidadeId, p.unidadeNome || p.unidadeId)
    return [...mapa.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [unidades, dados.pedidos])

  if (!user) return null
  if (!dados.gestor || comoFranqueado) return <Navigate to="/marketing" replace />

  const campanhasPorId = new Map(dados.campanhas.map((c) => [c.id, c.titulo]))
  const contagem = contarPorStatus(dados.pedidos)
  const pedidos = dados.pedidos.filter((p) => (filtroStatus === 'ativos' ? !['entregue', 'cancelada'].includes(p.status) : p.status === filtroStatus))

  async function gravarMaterial() {
    if (!user || !material || salvando) return
    const erros = validarMaterial(material)
    if (erros.length) return setErro(erros.join(' '))
    setSalvando(true)
    setErro('')
    try {
      await salvarMaterial(user, materialId, material)
      setOk('Material salvo.')
      setMaterial(null)
      setMaterialId(null)
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  async function gravarCampanha() {
    if (!user || !campanha || salvando) return
    if (campanha.titulo.trim().length < 2) return setErro('Dê um título para a campanha.')
    setSalvando(true)
    setErro('')
    try {
      await salvarCampanha(user, campanhaId, campanha)
      setOk('Campanha salva.')
      setCampanha(null)
      setCampanhaId(null)
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  async function gravarAndamento(p: PedidoMkt) {
    if (!user || salvando) return
    const a = andamento[p.id]
    if (!a) return
    if (a.status === 'entregue' && !linkHttpsValido(a.entregaUrl.trim())) return setErro('Para entregar, cole o link https da peça (Drive, por exemplo).')
    if (a.status === 'aguardando_unidade' && !a.resposta.trim()) return setErro('Escreva o que a unidade precisa responder.')
    if (a.geradoPorIA && a.iaModelo.trim().length < 2) return setErro('Informe qual IA ou modelo participou da peça.')
    if (a.status === 'entregue' && !window.confirm('Marcar este pedido como entregue? A unidade verá o link da peça.')) return
    if (a.status === 'cancelada' && !window.confirm('Cancelar este pedido?')) return
    setErro('')
    setSalvando(true)
    try {
      await andamentoPedido(user, p.id, a)
      setOk(`Pedido "${p.titulo}": ${ROTULO_STATUS[a.status].toLowerCase()}.`)
      setAndamento((atual) => {
        const copia = { ...atual }
        delete copia[p.id]
        return copia
      })
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Central de Marketing · Franqueadora</p>
          <h1 className="text-2xl font-black text-ink">Gestão do marketing</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-ink/65">
            Publique materiais por link (Drive ou outro https), monte o calendário de campanhas e atenda os pedidos de peça das unidades.
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-white p-1" role="tablist" aria-label="Seções da gestão">
          {(['materiais', 'campanhas', 'pedidos'] as Aba[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={aba === item}
              onClick={() => { setParams({ aba: item }); setErro(''); setOk('') }}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', aba === item ? 'bg-ink text-white' : 'text-ink/60 hover:text-ink')}
            >
              {ROTULO_ABA[item]}
              {item === 'pedidos' && contagem.aberta ? <span className="ml-1.5 rounded-full bg-brand px-1.5 text-[10px] text-white">{contagem.aberta}</span> : null}
            </button>
          ))}
        </div>
      </header>

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {dados.erro ? <Aviso tom="erro"><p role="alert">{dados.erro}</p><Button type="button" variant="secondary" className="mt-2" onClick={dados.recarregar}>Tentar novamente</Button></Aviso> : null}
      {dados.carregando ? <Carregando texto="Carregando…" /> : null}

      {aba === 'materiais' && !dados.carregando && !dados.erro ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_26rem]">
          <section className="space-y-2">
            <Button type="button" variant="secondary" onClick={() => { setMaterialId(null); setMaterial({ ...materialVazio }); setOk('') }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo material
            </Button>
            {!dados.materiais.length ? <Vazio titulo="Nenhum material ainda" texto="Cadastre artes, logos e templates pelo link do Drive." /> : null}
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {[...dados.materiais].sort((a, b) => b.atualizadoEmMs - a.atualizadoEmMs).map((m) => {
                const v = vigencia(m, agora)
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => { setMaterialId(m.id); setMaterial(paraForm(m)); setOk('') }} className={cx('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper', materialId === m.id && 'bg-paper')}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.titulo}</span>
                        <span className="text-xs text-ink/45">{ROTULO_TIPO[m.tipo]}{m.categoria ? ` · ${m.categoria}` : ''} · {m.publico ? 'rede toda' : `${m.unidades.length} unidade(s)`}{m.geradoPorIA ? ` · IA: ${m.iaModelo}` : ''}</span>
                      </span>
                      {!m.ativo ? <Selo>Inativo</Selo> : v === 'vencido' ? <Selo tom="alerta">Vencido</Selo> : v === 'futuro' ? <Selo tom="marca">Agendado</Selo> : <Selo tom="lima">No ar</Selo>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
          {material ? (
            <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">{materialId ? 'Editar material' : 'Novo material'}</h2>
              <Campo label="Título"><input className={inputClass} maxLength={120} value={material.titulo} onChange={(e) => setMaterial({ ...material, titulo: e.target.value })} /></Campo>
              <Campo label="Descrição"><textarea className={inputClass} rows={2} maxLength={1000} value={material.descricao} onChange={(e) => setMaterial({ ...material, descricao: e.target.value })} /></Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Tipo">
                  <select className={inputClass} value={material.tipo} onChange={(e) => setMaterial({ ...material, tipo: e.target.value as MaterialForm['tipo'] })}>
                    {TIPOS_MATERIAL.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                  </select>
                </Campo>
                <Campo label="Categoria">
                  <input className={inputClass} list="categorias-mkt" maxLength={60} value={material.categoria} onChange={(e) => setMaterial({ ...material, categoria: e.target.value })} placeholder="Ex.: Redes sociais" />
                  <datalist id="categorias-mkt">{categoriasDe(dados.materiais).map((c) => <option key={c} value={c} />)}</datalist>
                </Campo>
              </div>
              <Campo label="Link do material" hint="Link https de compartilhamento (Google Drive, por exemplo). O arquivo não fica no portal.">
                <input className={inputClass} value={material.url} onChange={(e) => setMaterial({ ...material, url: e.target.value })} placeholder="https://drive.google.com/…" />
              </Campo>
              <Campo label="Link da prévia (imagem, opcional)">
                <input className={inputClass} value={material.previaUrl} onChange={(e) => setMaterial({ ...material, previaUrl: e.target.value })} placeholder="https://…" />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Formato"><input className={inputClass} maxLength={40} value={material.formato} onChange={(e) => setMaterial({ ...material, formato: e.target.value })} placeholder="PNG 1080x1080" /></Campo>
                <Campo label="Campanha">
                  <select className={inputClass} value={material.campanhaId} onChange={(e) => setMaterial({ ...material, campanhaId: e.target.value })}>
                    <option value="">Nenhuma</option>
                    {dados.campanhas.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                  </select>
                </Campo>
                <Campo label="Válido de"><input type="date" className={inputClass} value={material.validoDe} onChange={(e) => setMaterial({ ...material, validoDe: e.target.value })} /></Campo>
                <Campo label="Válido até"><input type="date" className={inputClass} value={material.validoAte} onChange={(e) => setMaterial({ ...material, validoAte: e.target.value })} /></Campo>
              </div>
              <Campo label="Regras de uso"><textarea className={inputClass} rows={2} maxLength={1000} value={material.regrasUso} onChange={(e) => setMaterial({ ...material, regrasUso: e.target.value })} placeholder="Ex.: não alterar cores nem o logo" /></Campo>
              <div className="space-y-2 rounded-2xl border border-line p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={material.publico} onChange={(e) => setMaterial({ ...material, publico: e.target.checked })} /> Para a rede toda
                </label>
                {!material.publico ? (
                  <fieldset className="max-h-40 space-y-1 overflow-y-auto">
                    <legend className="text-xs text-ink/55">Unidades que recebem (até 30)</legend>
                    {!opcoesUnidade.length ? <p className="text-xs text-ink/55">Nenhuma unidade disponível para escolher.</p> : null}
                    {opcoesUnidade.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={material.unidades.includes(u.id)}
                          onChange={(e) => setMaterial({ ...material, unidades: e.target.checked ? [...material.unidades, u.id] : material.unidades.filter((x) => x !== u.id) })}
                        />
                        {u.nome}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
              </div>
              <CamposIA ligado={material.geradoPorIA} modelo={material.iaModelo} mudar={(geradoPorIA, iaModelo) => setMaterial({ ...material, geradoPorIA, iaModelo })} />
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={material.ativo} onChange={(e) => setMaterial({ ...material, ativo: e.target.checked })} /> Ativo (visível para as unidades)
              </label>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void gravarMaterial()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar material'}</Button>
                <Button type="button" variant="secondary" onClick={() => { setMaterial(null); setMaterialId(null) }}>Fechar</Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {aba === 'campanhas' && !dados.carregando && !dados.erro ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
          <section className="space-y-2">
            <Button type="button" variant="secondary" onClick={() => { setCampanhaId(null); setCampanha({ ...campanhaVazia }); setOk('') }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Nova campanha ou data
            </Button>
            {!dados.campanhas.length ? <Vazio titulo="Calendário vazio" texto="Cadastre campanhas e datas comemorativas da rede." /> : null}
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {[...dados.campanhas].sort((a, b) => a.inicioMs - b.inicioMs).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { setCampanhaId(c.id); setCampanha({ titulo: c.titulo, descricao: c.descricao, tipo: c.tipo, inicio: inputDaData(c.inicioMs), fim: inputDaData(c.fimMs), ativo: c.ativo, geradoPorIA: c.geradoPorIA, iaModelo: c.iaModelo }); setOk('') }}
                    className={cx('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper', campanhaId === c.id && 'bg-paper')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.titulo}</span>
                      <span className="text-xs text-ink/45">{ROTULO_CAMPANHA[c.tipo]} · {formatarDia(c.inicioMs)} a {formatarDia(c.fimMs)}</span>
                    </span>
                    {c.ativo ? <Selo tom="lima">Ativa</Selo> : <Selo>Inativa</Selo>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {campanha ? (
            <section className="space-y-3 rounded-3xl border border-line bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold">{campanhaId ? 'Editar campanha' : 'Nova campanha'}</h2>
              <Campo label="Título"><input className={inputClass} maxLength={120} value={campanha.titulo} onChange={(e) => setCampanha({ ...campanha, titulo: e.target.value })} /></Campo>
              <Campo label="Tipo">
                <select className={inputClass} value={campanha.tipo} onChange={(e) => setCampanha({ ...campanha, tipo: e.target.value as CampanhaForm['tipo'] })}>
                  {TIPOS_CAMPANHA.map((t) => <option key={t} value={t}>{ROTULO_CAMPANHA[t]}</option>)}
                </select>
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Início"><input type="date" className={inputClass} value={campanha.inicio} onChange={(e) => setCampanha({ ...campanha, inicio: e.target.value })} /></Campo>
                <Campo label="Fim"><input type="date" className={inputClass} value={campanha.fim} onChange={(e) => setCampanha({ ...campanha, fim: e.target.value })} /></Campo>
              </div>
              <Campo label="Descrição / orientações"><textarea className={inputClass} rows={3} maxLength={1000} value={campanha.descricao} onChange={(e) => setCampanha({ ...campanha, descricao: e.target.value })} /></Campo>
              <CamposIA ligado={campanha.geradoPorIA} modelo={campanha.iaModelo} mudar={(geradoPorIA, iaModelo) => setCampanha({ ...campanha, geradoPorIA, iaModelo })} />
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={campanha.ativo} onChange={(e) => setCampanha({ ...campanha, ativo: e.target.checked })} /> Ativa (aparece no calendário das unidades)
              </label>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void gravarCampanha()} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar campanha'}</Button>
                <Button type="button" variant="secondary" onClick={() => { setCampanha(null); setCampanhaId(null) }}>Fechar</Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {aba === 'pedidos' && !dados.carregando && !dados.erro ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar pedidos">
            {(['ativos', ...STATUS_PEDIDO] as const).map((s) => (
              <button key={s} type="button" aria-pressed={filtroStatus === s} onClick={() => setFiltroStatus(s)} className={filtroStatus === s ? 'rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white' : 'rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink/60'}>
                {s === 'ativos' ? 'Em aberto' : ROTULO_STATUS[s]} {s === 'ativos' ? contagem.aberta + contagem.em_producao + contagem.aguardando_unidade : contagem[s]}
              </button>
            ))}
          </div>
          {!pedidos.length ? <Vazio titulo="Nenhum pedido aqui" texto="Os pedidos de peça das unidades aparecem nesta fila." /> : null}
          <ul className="space-y-3">
            {pedidos.map((p) => {
              const proximos = proximosStatusGestor(p.status)
              const a = andamento[p.id]
              return (
                <li key={p.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                  <DetalhePedido pedido={p} campanha={campanhasPorId.get(p.campanhaId)} />
                  {proximos.length ? (
                    <div className="mt-3 space-y-2 border-t border-line pt-3">
                      <div className="flex flex-wrap gap-1.5">
                        {proximos.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setAndamento({ ...andamento, [p.id]: { status: s, resposta: a?.resposta ?? p.resposta, entregaUrl: a?.entregaUrl ?? '', geradoPorIA: a?.geradoPorIA ?? false, iaModelo: a?.iaModelo ?? '' } })}
                            className={cx('rounded-full border px-3 py-1 text-xs font-semibold', a?.status === s ? 'border-brand bg-brand text-white' : 'border-line text-ink/70 hover:border-ink/30')}
                          >
                            {ROTULO_STATUS[s]}
                          </button>
                        ))}
                      </div>
                      {a ? (
                        <div className="space-y-2">
                          <textarea className={inputClass} rows={2} maxLength={2000} placeholder="Mensagem para a unidade" value={a.resposta} onChange={(e) => setAndamento({ ...andamento, [p.id]: { ...a, resposta: e.target.value } })} aria-label="Mensagem para a unidade" />
                          {a.status === 'entregue' ? (
                            <>
                              <input className={inputClass} placeholder="Link https da peça pronta" value={a.entregaUrl} onChange={(e) => setAndamento({ ...andamento, [p.id]: { ...a, entregaUrl: e.target.value } })} aria-label="Link da peça pronta" />
                              <CamposIA ligado={a.geradoPorIA} modelo={a.iaModelo} mudar={(geradoPorIA, iaModelo) => setAndamento({ ...andamento, [p.id]: { ...a, geradoPorIA, iaModelo } })} />
                            </>
                          ) : null}
                          <Button type="button" disabled={salvando} onClick={() => void gravarAndamento(p)}>{salvando ? 'Salvando…' : `Salvar: ${ROTULO_STATUS[a.status]}`}</Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

    </div>
  )
}

