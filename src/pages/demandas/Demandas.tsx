import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Aviso, Button, Campo, Vazio, inputClass } from '../../components/ui'
import { AREAS, type Area } from '../../data/areas'
import { filtrarDemandas, hojeLocal, ordenarDemandas, PRIORIDADES_DEMANDA, STATUS_DEMANDA,
  type EscopoDemanda, type PrioridadeDemanda } from '../../lib/demandas'
import { listarDemandas, listarPessoasRede } from '../../lib/demandasSupabase'
import { useAuth } from '../../lib/auth'
import { DetalheDemanda } from './DetalheDemanda'
import { FormularioDemanda } from './FormularioDemanda'
import { EstadoConsulta, IniciaisResponsaveis, MetadadosDemanda, NovaDemandaBotao, PainelDemanda, useConsultaDemandas } from './partes'

const escopos = { minhas: 'Minhas', area: 'Da minha área', criadas: 'Criadas por mim', todas: 'Todas' } as const
const bordas = { a_fazer: 'border-t-line-strong', em_andamento: 'border-t-brand', aguardando: 'border-t-ink-soft', concluida: 'border-t-lime-dark' }

export default function DemandasPage() {
  const { user } = useAuth()
  const uid = user?.uid ?? ''
  const admin = user?.papel === 'admin'
  const [params, setParams] = useSearchParams()
  const consultar = useCallback(() => listarDemandas(), [])
  const quadro = useConsultaDemandas(consultar)
  const equipe = useConsultaDemandas(listarPessoasRede)
  const pessoas = useMemo(() => new Map(equipe.dados?.map((pessoa) => [pessoa.id, pessoa])), [equipe.dados])
  const minhaArea = equipe.dados ? pessoas.get(uid)?.area : user?.area
  const hoje = hojeLocal()
  const id = params.get('id')
  const demanda = id ? quadro.dados?.find((d) => d.id === id) : undefined
  const novo = params.has('novo')
  const editando = params.has('editar')
  const podeEditar = Boolean(demanda && (admin || demanda.criadoPor === uid))

  const opcoes = Object.entries(escopos).filter(([valor]) => valor !== 'todas' || admin)
  const escopo = (opcoes.find(([valor]) => valor === params.get('escopo'))?.[0] ?? 'minhas') as EscopoDemanda
  const busca = params.get('busca') ?? ''
  const area = (params.get('area') ?? '') as Area | ''
  const prioridade = (params.get('prioridade') ?? '') as PrioridadeDemanda | ''
  const filtradas = ordenarDemandas(filtrarDemandas(quadro.dados ?? [], { uid, escopo, minhaArea, busca, area, prioridade }), hoje)

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
  const abrirNova = () => ajustar({ novo: '1', id: null, editar: null })
  const aoSalvar = (demandaId: string) => {
    quadro.recarregar()
    ajustar({ id: demandaId, novo: null, editar: null }, true)
    atualizarBadge()
  }
  function atualizarBadge() {
    window.dispatchEvent(new Event('demandas:alteradas'))
  }

  return (
    <div className="space-y-5">
      <header className="cabecalho-pagina flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Demandas da franqueadora</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">Acompanhe o trabalho interno da rede, os responsáveis e os prazos em um só quadro.</p>
        </div>
        <NovaDemandaBotao abrir={abrirNova} />
      </header>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-3 sm:p-4" aria-label="Filtros de demandas">
        <div className="flex flex-wrap gap-1 rounded-xl bg-paper p-1" role="group" aria-label="Escopo do quadro">
          {opcoes.map(([valor, nome]) => (
            <Button key={valor} variant={valor === escopo ? 'secondary' : 'ghost'} aria-pressed={valor === escopo}
              onClick={() => ajustar({ escopo: valor }, true)}>{nome}</Button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
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
      {equipe.erro ? <EstadoConsulta {...equipe} texto="" falha="Não foi possível carregar os nomes da equipe." /> : null}
      {quadro.erro || !quadro.dados ? <EstadoConsulta {...quadro} texto="Carregando o quadro…" falha="Não foi possível carregar o quadro de demandas." />
        : filtradas.length === 0 ? (
          <Vazio titulo="Nenhuma demanda nesta visão"
            texto={escopo === 'area' && !minhaArea ? 'Peça a um admin para definir a sua área ou selecione outra visão.' : 'Mude os filtros ou crie uma demanda para começar.'}
            acao={busca || area || prioridade ? <Button variant="secondary" onClick={() => ajustar({ busca: null, area: null, prioridade: null }, true)}>Limpar filtros</Button>
              : <NovaDemandaBotao abrir={abrirNova} />} />
        ) : (
          <div className="grid items-start gap-3 xl:grid-cols-4" aria-label="Quadro de demandas">
            {Object.entries(STATUS_DEMANDA).map(([status, nome]) => {
              const lista = filtradas.filter((d) => d.status === status)
              return (
                <section key={status} className={`min-w-0 rounded-xl border border-line border-t-4 bg-paper p-3 ${bordas[status as keyof typeof bordas]}`}>
                  <h2 className="mb-3 flex items-center justify-between gap-2 text-sm font-extrabold">
                    {nome}<span className="rounded-full border border-line bg-surface px-2 py-0.5 text-xs tabular-nums">{lista.length}</span>
                  </h2>
                  {lista.length ? <ul className="space-y-2">
                    {lista.map((item) => {
                      const destino = new URLSearchParams(params)
                      destino.set('id', item.id)
                      return <li key={item.id} className="[content-visibility:auto]">
                        <Link to={`?${destino}`} className="block space-y-2 rounded-xl border border-line bg-surface p-3 shadow-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand-dark">
                          <h3 className="wrap-anywhere text-sm font-bold">{item.titulo}</h3>
                          <MetadadosDemanda demanda={item} hoje={hoje} />
                          <IniciaisResponsaveis ids={item.responsaveis} pessoas={pessoas} />
                        </Link>
                      </li>
                    })}
                  </ul> : <p className="text-xs text-muted">Nenhuma demanda</p>}
                </section>
              )
            })}
          </div>
        )}
      {novo ? <FormularioDemanda key="nova" pessoas={equipe} fechar={fechar} aoSalvar={aoSalvar} />
        : demanda ? (editando && podeEditar
          ? <FormularioDemanda key={demanda.id} demanda={demanda} pessoas={equipe} fechar={() => ajustar({ editar: null }, true)} aoSalvar={aoSalvar} />
          : <DetalheDemanda key={demanda.id} demanda={demanda} hoje={hoje} pessoas={pessoas} admin={admin} podeEditar={podeEditar}
              falhaAtualizar={quadro.erro} recarregar={quadro.recarregar} fechar={fechar} editar={() => ajustar({ editar: '1' })} atualizar={() => { quadro.recarregar(); atualizarBadge() }} />)
          : id ? <PainelDemanda titulo="Demanda" fechar={fechar}>
              {quadro.erro || quadro.carregando ? <EstadoConsulta {...quadro} texto="Carregando demanda…" falha="Não foi possível abrir a demanda." />
                : <Aviso>Demanda indisponível. Volte ao quadro para consultar as demandas que você pode acessar.</Aviso>}
            </PainelDemanda> : null}
    </div>
  )
}
