import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Aviso, Button, Campo, Vazio, inputClass } from '../../components/ui'
import { AREAS, type Area } from '../../data/areas'
import { demandasDaUnidade, filtrarDemandas, hojeLocal, ordenarDemandas, PRIORIDADES_DEMANDA, STATUS_DEMANDA,
  type DestinoDemanda, type EscopoDemanda, type PrioridadeDemanda } from '../../lib/demandas'
import { listarDemandas, listarPessoasRede, listarUnidadesDemanda } from '../../lib/demandasSupabase'
import { useAuth } from '../../lib/auth'
import { useVisao } from '../../lib/visao'
import { CalendarioDemandas } from './CalendarioDemandas'
import { ListaDemandas } from './ListaDemandas'
import { DetalheDemanda } from './DetalheDemanda'
import { FormularioDemanda } from './FormularioDemanda'
import { EstadoConsulta, IniciaisResponsaveis, MetadadosDemanda, NovaDemandaBotao, PainelDemanda, useConsultaDemandas } from './partes'

const escopos = { minhas: 'Minhas', area: 'Da minha área', criadas: 'Criadas por mim', todas: 'Todas' } as const
const bordas = { a_fazer: 'border-t-line-strong', em_andamento: 'border-t-brand', aguardando: 'border-t-ink-soft', concluida: 'border-t-lime-dark' }

const visoes = { quadro: 'Quadro', lista: 'Lista', calendario: 'Calendário' } as const
type Visao = keyof typeof visoes
const chaveVisao = 'demandas:visao'
const eVisao = (valor: string | null): valor is Visao => valor !== null && Object.hasOwn(visoes, valor)

function preferencia(): Visao {
  try {
    const valor = localStorage.getItem(chaveVisao)
    if (eVisao(valor)) return valor
  } catch { /* O armazenamento pode estar indisponível. */ }
  return 'quadro'
}

const vazio = () => Promise.resolve([])

export default function DemandasPage() {
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const uid = pessoa?.uid ?? ''
  const admin = !comoFranqueado && user?.papel === 'admin'
  const rede = !comoFranqueado && (admin || user?.papel === 'equipe_franqueadora')
  const unidadeId = !rede ? pessoa?.unidadeId ?? undefined : undefined
  const [params, setParams] = useSearchParams()
  const [preferida, setPreferida] = useState(preferencia)
  const [confirmacao, setConfirmacao] = useState('')
  const visaoUrl = params.get('visao')
  const visao = eVisao(visaoUrl) ? visaoUrl : preferida
  const consultar = useCallback(() => listarDemandas(undefined, unidadeId), [unidadeId])
  const quadro = useConsultaDemandas(consultar)
  const novo = rede && params.has('novo')
  const editando = rede && params.has('editar')
  const equipe = useConsultaDemandas(rede ? listarPessoasRede : vazio)
  const diretorio = useConsultaDemandas(novo ? listarUnidadesDemanda : vazio)
  const minhaArea = equipe.dados ? equipe.dados.find((p) => p.id === uid)?.area : user?.area
  const hoje = hojeLocal()
  const mesUrl = params.get('mes') ?? ''
  const mes = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(mesUrl) ? mesUrl : hoje.slice(0, 7)
  const id = params.get('id')
  const visiveis = rede ? quadro.dados ?? [] : demandasDaUnidade(quadro.dados ?? [], unidadeId)
  const demanda = id ? visiveis.find((d) => d.id === id) : undefined
  const podeEditar = Boolean(rede && demanda && (admin || demanda.criadoPor === uid))

  const opcoes = rede ? Object.entries(escopos).filter(([valor]) => valor !== 'todas' || admin)
    : [['para-mim', 'Para mim'], ...(pessoa?.papel === 'franqueado' ? [['da-unidade', 'Da unidade']] : [])]
  const aba = opcoes.find(([valor]) => valor === params.get('escopo'))?.[0] ?? (rede ? 'minhas' : 'para-mim')
  const busca = params.get('busca') ?? ''
  const area = (params.get('area') ?? '') as Area | ''
  const prioridade = (params.get('prioridade') ?? '') as PrioridadeDemanda | ''
  const destinoUrl = params.get('destino')
  const destino: DestinoDemanda | '' = rede && (destinoUrl === 'interna' || destinoUrl === 'unidade') ? destinoUrl : ''
  const unidadeFiltro = destino === 'unidade' ? params.get('unidade') ?? '' : ''
  const porAba = !rede && aba === 'para-mim' ? demandasDaUnidade(visiveis, unidadeId, uid) : visiveis
  const filtradas = ordenarDemandas(filtrarDemandas(porAba, {
    uid, escopo: rede ? aba as EscopoDemanda : 'todas', minhaArea, busca, area, prioridade, destino, unidadeId: unidadeFiltro,
  }), hoje)
  const unidades = [...new Map(visiveis.flatMap((d) => d.unidadeId ? [[d.unidadeId, d.unidadeNome ?? d.unidadeId] as const] : [])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))

  function ajustar(valores: Record<string, string | null>, replace = false) {
    setParams((anterior) => {
      const proximo = new URLSearchParams(anterior)
      for (const [chave, valor] of Object.entries(valores)) {
        if (valor) proximo.set(chave, valor)
        else proximo.delete(chave)
      }
      return proximo
    }, { replace })
  }

  const fechar = () => ajustar({ id: null, editar: null, novo: null }, true)
  const abrirNova = () => ajustar({ visao, novo: '1', id: null, editar: null })
  const aoSalvar = (demandaId: string | null, total?: number) => {
    quadro.recarregar()
    setConfirmacao(total ? `Demanda enviada para ${total} ${total === 1 ? 'unidade' : 'unidades'}` : '')
    ajustar({
      id: demandaId, novo: null, editar: null,
      ...(total ? { escopo: 'criadas', destino: 'unidade', unidade: null, busca: null, area: null, prioridade: null } : {}),
    }, true)
    atualizarBadge()
  }
  function link(id: string) {
    const destino = new URLSearchParams(params)
    destino.set('visao', visao)
    destino.set('id', id)
    return `?${destino}`
  }
  function escolherVisao(valor: Visao) {
    setPreferida(valor)
    try { localStorage.setItem(chaveVisao, valor) } catch { /* A URL preserva a preferência nesta navegação. */ }
    ajustar({ visao: valor }, true)
  }
  function atualizarBadge() {
    window.dispatchEvent(new Event('demandas:alteradas'))
  }

  return (
    <div className="space-y-5">
      <header className="cabecalho-pagina flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Demandas da franqueadora</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">{rede ? 'Acompanhe o trabalho interno e as tarefas enviadas às unidades.' : 'Acompanhe os prazos e o andamento das tarefas enviadas pela franqueadora à sua unidade.'}</p>
        </div>
        {rede ? <NovaDemandaBotao abrir={abrirNova} /> : null}
      </header>

      {comoFranqueado ? <Aviso>Simulação de unidade. Você pode consultar as demandas em modo somente leitura.</Aviso> : null}
      <div role="status" className={confirmacao ? undefined : 'sr-only'}>
        {confirmacao ? <Aviso tom="ok">{confirmacao}</Aviso> : null}
      </div>
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-3 sm:p-4" aria-label="Filtros de demandas">
        <div className="-mx-1 flex gap-1 overflow-x-auto rounded-xl bg-paper p-1 [scrollbar-width:thin] sm:mx-0" role="group" aria-label="Escopo das demandas">
          {opcoes.map(([valor, nome]) => (
            <Button key={valor} className="shrink-0 whitespace-nowrap" variant={valor === aba ? 'secondary' : 'ghost'} aria-pressed={valor === aba}
              onClick={() => ajustar({ escopo: valor }, true)}>{nome}</Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {rede ? <Campo label="Destino"><select name="destino" className={inputClass} value={destino}
            onChange={(e) => ajustar({ destino: e.target.value, unidade: null }, true)}>
            <option value="">Todas</option><option value="interna">Internas</option><option value="unidade">Para unidades</option>
          </select></Campo> : null}
          {destino === 'unidade' ? <Campo label="Unidade"><select name="unidade" className={inputClass} value={unidadeFiltro}
            onChange={(e) => ajustar({ unidade: e.target.value }, true)}>
            <option value="">Todas as unidades</option>
            {unidades.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select></Campo> : null}
          <Campo label="Buscar por título"><input name="busca" type="search" className={inputClass} value={busca}
            onChange={(e) => ajustar({ busca: e.target.value }, true)} /></Campo>
          <Campo label="Área"><select name="area-quadro" className={inputClass} value={area} onChange={(e) => ajustar({ area: e.target.value }, true)}>
            <option value="">Todas as áreas</option>
            {Object.entries(AREAS).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
          </select></Campo>
          <Campo label="Prioridade"><select name="prioridade-quadro" className={inputClass} value={prioridade} onChange={(e) => ajustar({ prioridade: e.target.value }, true)}>
            <option value="">Todas as prioridades</option>
            {Object.entries(PRIORIDADES_DEMANDA).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
          </select></Campo>
        </div>
      </section>
      <div role="group" aria-label="Visualização" className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-paper p-1">
        {(Object.keys(visoes) as Visao[]).map((valor) => <Button key={valor} variant={visao === valor ? 'secondary' : 'ghost'}
          aria-pressed={visao === valor} onClick={() => escolherVisao(valor)}>{visoes[valor]}</Button>)}
      </div>
      {quadro.erro || !quadro.dados ? <EstadoConsulta {...quadro} texto="Carregando demandas…" falha="Não foi possível carregar as demandas." />
        : visao === 'calendario' ? <CalendarioDemandas demandas={filtradas} hoje={hoje} mes={mes} dia={params.get('dia')}
            semanal={params.get('periodo') === 'semana'} ajustar={(valores) => ajustar({ ...valores, visao: 'calendario' })}
            abrir={(id) => ajustar({ id, visao: 'calendario' })} />
        : filtradas.length === 0 ? (
          <Vazio titulo="Nenhuma demanda nesta visão"
            texto={aba === 'area' && !minhaArea ? 'Peça a um admin para definir a sua área ou selecione outra visão.'
              : rede ? 'Mude os filtros ou crie uma demanda para começar.' : 'Acompanhe aqui as próximas tarefas enviadas à sua unidade.'}
            acao={busca || area || prioridade || destino
              ? <Button variant="secondary" onClick={() => ajustar({ busca: null, area: null, prioridade: null, destino: null, unidade: null }, true)}>Limpar filtros</Button>
              : rede ? <NovaDemandaBotao abrir={abrirNova} /> : null} />
        ) : visao === 'lista' ? <ListaDemandas demandas={filtradas} hoje={hoje} link={link}
            ordem={params.get('ordem')} ordenar={(ordem) => ajustar({ ordem, visao: 'lista' }, true)} /> : (
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Quadro de demandas">
            {Object.entries(STATUS_DEMANDA).map(([status, nome]) => {
              const lista = filtradas.filter((d) => d.status === status)
              return (
                <section key={status} className={`min-w-0 rounded-xl border border-line border-t-4 bg-paper p-3 ${bordas[status as keyof typeof bordas]}`}>
                  <h2 className="mb-3 flex items-center justify-between gap-2 text-sm font-extrabold">
                    {nome}<span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs tabular-nums">{lista.length}</span>
                  </h2>
                  {lista.length ? <ul className="space-y-2">
                    {lista.map((item) => (
                      <li key={item.id} className="[content-visibility:auto]">
                        <Link to={link(item.id)} className="block space-y-2 rounded-xl border border-line bg-surface p-3 shadow-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand-dark">
                          <h3 className="wrap-anywhere text-sm font-bold">{item.titulo}</h3>
                          <MetadadosDemanda demanda={item} hoje={hoje} />
                          <IniciaisResponsaveis ids={item.responsaveis} pessoas={item.responsaveisNomes} />
                        </Link>
                      </li>
                    ))}
                  </ul> : <p className="text-xs text-muted">Nenhuma demanda</p>}
                </section>
              )
            })}
          </div>
        )}
      {novo ? <FormularioDemanda key="nova" pessoas={equipe} unidades={diretorio} fechar={fechar} aoSalvar={aoSalvar} />
        : demanda ? (editando && podeEditar
          ? <FormularioDemanda key={demanda.id} demanda={demanda} pessoas={equipe} unidades={diretorio} fechar={() => ajustar({ editar: null }, true)} aoSalvar={aoSalvar} />
          : <DetalheDemanda key={demanda.id} demanda={demanda} hoje={hoje} somenteLeitura={comoFranqueado} admin={admin} podeEditar={podeEditar}
              falhaAtualizar={quadro.erro} recarregar={quadro.recarregar} fechar={fechar} editar={() => ajustar({ editar: '1' })} atualizar={() => { quadro.recarregar(); atualizarBadge() }} />)
          : id ? <PainelDemanda titulo="Demanda" fechar={fechar}>
              {quadro.erro || quadro.carregando ? <EstadoConsulta {...quadro} texto="Carregando demanda…" falha="Não foi possível abrir a demanda." />
                : <Aviso>Demanda indisponível. Volte ao quadro para consultar as demandas que você pode acessar.</Aviso>}
            </PainelDemanda> : null}
    </div>
  )
}
