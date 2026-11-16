import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Button, Carregando, Selo, Vazio } from '../../components/ui'
import {
  CATEGORIAS_ACESSO,
  contarPessoasComAcesso,
  nomeCategoriaAcesso,
  nomeStatusSolicitacao,
  senhaVencida,
} from '../../data/senhas'
import {
  decidirSolicitacaoAcesso,
  observarAcessos,
  observarSolicitacoes,
  type Acesso,
  type SolicitacaoAcesso,
} from '../../lib/senhas'
import { listarEquipeDaUnidade } from '../../lib/gestao'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData, paraMillis } from '../../lib/format'
import { useVisao } from '../../lib/visao'
import { ModalDetalheAcesso } from './ModalDetalheAcesso'
import { ModalNovoSistema } from './ModalNovoSistema'
import { ModalSolicitacao } from './ModalSolicitacao'

export function CofrePage() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user

  const rede = Boolean(user && (user.papel === 'admin' || user.papel === 'equipe_franqueadora') && !comoFranqueado)
  const unidadeId = rede ? null : pessoa?.unidadeId ?? null
  const unidadeNome = (comoFranqueado ? simulado?.unidade : user?.unidade) || 'Unidade'

  const [acessos, setAcessos] = useState<Acesso[]>([])
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoAcesso[]>([])
  const [equipeUnidade, setEquipeUnidade] = useState<{ uid: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // Filtros da tabela
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('')

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false)
  const [modalPedirAberto, setModalPedirAberto] = useState(false)
  const [acessoSelecionado, setAcessoSelecionado] = useState<Acesso | null>(null)

  // Carrega equipe da unidade
  useEffect(() => {
    if (!unidadeId) {
      setEquipeUnidade([])
      return
    }
    void listarEquipeDaUnidade(unidadeId)
      .then((membros) => setEquipeUnidade(membros.map((m) => ({ uid: m.uid, nome: m.nome }))))
      .catch(() => setEquipeUnidade([]))
  }, [unidadeId])

  // Ouve acessos
  useEffect(() => {
    if (!user || (!rede && !unidadeId)) {
      setCarregando(false)
      return
    }
    setCarregando(true)
    const unsub = observarAcessos(
      { rede, unidadeId },
      (itens) => {
        setAcessos(itens)
        setCarregando(false)
      },
      (falha) => {
        setErro(mensagemErro(falha))
        setCarregando(false)
      },
    )
    return unsub
  }, [user, rede, unidadeId])

  // Ouve solicitações
  useEffect(() => {
    if (!user || (!rede && !unidadeId)) return
    return observarSolicitacoes(
      { rede, unidadeId },
      setSolicitacoes,
      (falha) => console.warn('Erro ao carregar solicitações:', falha),
    )
  }, [user, rede, unidadeId])

  // Filtro de acessos
  const acessosFiltrados = useMemo(() => {
    return acessos.filter((item) => {
      if (categoriaFiltro && item.categoria !== categoriaFiltro) return false
      if (busca.trim()) {
        const termo = busca.toLowerCase()
        const nomeMatch = item.nome.toLowerCase().includes(termo)
        const respMatch = item.responsavelNome.toLowerCase().includes(termo)
        const catMatch = nomeCategoriaAcesso(item.categoria).toLowerCase().includes(termo)
        if (!nomeMatch && !respMatch && !catMatch) return false
      }
      return true
    })
  }, [acessos, categoriaFiltro, busca])

  // KPIs
  const kpis = useMemo(() => {
    const totalSistemas = acessos.length
    const uidsEquipe = equipeUnidade.map((m) => m.uid)
    const totalPessoas = contarPessoasComAcesso(acessos, uidsEquipe, pessoa?.uid)
    const totalVencidas = acessos.filter((a) =>
      senhaVencida(paraMillis(a.ultimaTrocaEm), Date.now(), a.pendenteTroca),
    ).length
    const pedidosEmAberto = solicitacoes.filter((s) => s.status === 'aberta').length

    return { totalSistemas, totalPessoas, totalVencidas, pedidosEmAberto }
  }, [acessos, equipeUnidade, pessoa, solicitacoes])

  // Solicitações recentes (máximo 4)
  const solicitacoesRecentes = useMemo(() => {
    return solicitacoes.slice(0, 4)
  }, [solicitacoes])

  if (!user) return null
  if (comoFranqueado && !simulado) {
    return <Aviso>Escolha qual franqueado simular para ver a Central de Acessos dessa unidade.</Aviso>
  }
  if (!rede && !unidadeId) {
    return <Aviso tom="erro">Esta conta não está ligada a uma unidade e ainda não possui cofre.</Aviso>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">
            Suporte e Marketing · Rede Ubox
          </p>
          <h1 className="text-2xl font-black text-ink">Central de Acessos e Senhas</h1>
          <p className="mt-0.5 text-sm text-ink/65">
            {rede
              ? 'Cofre e catálogo de sistemas da rede. Homologue logins e acompanhe o status de rotação.'
              : 'Cofre oficial dos sistemas da unidade. Cada senha tem dono, permissão e data da última troca.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setModalPedirAberto(true)}
            disabled={comoFranqueado}
          >
            Pedir acesso
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => setModalNovoAberto(true)}
            disabled={comoFranqueado}
          >
            <span className="font-bold">+</span> Novo sistema
          </Button>
        </div>
      </div>

      {comoFranqueado ? (
        <Aviso>
          Modo de visualização do franqueado. As credenciais confidenciais e ações de rotação ficam desabilitadas
          nesta simulação por política de segurança.
        </Aviso>
      ) : null}

      {rede ? (
        <Aviso>
          Visualização da franqueadora. Você pode homologar e gerenciar sistemas de escopo da rede. As senhas de
          sistemas de cada unidade são protegidas e restritas aos franqueados.
        </Aviso>
      ) : null}

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-ink/40">
            {rede ? 'Sistemas da rede' : 'Sistemas da unidade'}
          </p>
          <p className="mt-1.5 text-3xl font-black text-ink">{kpis.totalSistemas}</p>
          <p className="mt-1 text-xs text-ink/50">Homologados pela franqueadora</p>
        </article>

        <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-ink/40">Pessoas com acesso</p>
          <p className="mt-1.5 text-3xl font-black text-ink">{kpis.totalPessoas}</p>
          <p className="mt-1 truncate text-xs text-ink/50">{rede ? 'Rede Ubox' : unidadeNome}</p>
        </article>

        <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-ink/40">Senhas vencidas</p>
          <p
            className={`mt-1.5 text-3xl font-black ${
              kpis.totalVencidas > 0 ? 'text-amber-600' : 'text-ink'
            }`}
          >
            {kpis.totalVencidas}
          </p>
          <p className="mt-1 text-xs text-ink/50">Sem rotação há mais de 90 dias</p>
        </article>

        <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-ink/40">Pedidos em aberto</p>
          <p className="mt-1.5 text-3xl font-black text-ink">{kpis.pedidosEmAberto}</p>
          <p className="mt-1 text-xs text-ink/50">Aguardando aprovação</p>
        </article>
      </div>

      {/* Grid Principal: Cofre à esquerda e Solicitações à direita */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        {/* Cofre da Unidade / Rede */}
        <section className="rounded-3xl border border-line bg-white shadow-sm overflow-hidden">
          <div className="border-b border-line p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink">
                  {rede ? 'Cofre da rede' : `Cofre da unidade · ${unidadeNome}`}
                </h2>
                <p className="text-xs text-ink/55">
                  Clique em um sistema para visualizar detalhes, senha ou trocar credenciais.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  placeholder="Buscar sistema ou dono…"
                  className="rounded-xl border border-line bg-paper px-3 py-1.5 text-xs text-ink outline-none focus:border-brand focus:bg-white"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <select
                  className="rounded-xl border border-line bg-paper px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand focus:bg-white"
                  value={categoriaFiltro}
                  onChange={(e) => setCategoriaFiltro(e.target.value)}
                >
                  <option value="">Todas as categorias</option>
                  {CATEGORIAS_ACESSO.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {carregando ? (
            <div className="p-8">
              <Carregando texto="Carregando sistemas do cofre…" />
            </div>
          ) : acessosFiltrados.length === 0 ? (
            <div className="p-6">
              <Vazio
                titulo="Nenhum sistema no cofre"
                texto={
                  busca || categoriaFiltro
                    ? 'Nenhum resultado corresponde aos filtros aplicados.'
                    : 'Cadastre o primeiro sistema homologado usando o botão Novo sistema acima.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-paper/60 text-[11px] font-bold uppercase tracking-wider text-ink/50">
                    <th className="px-5 py-3">Sistema</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3">Última troca</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {acessosFiltrados.map((item) => {
                    const millis = paraMillis(item.ultimaTrocaEm)
                    const estaVencida = senhaVencida(millis, Date.now(), item.pendenteTroca)
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setAcessoSelecionado(item)}
                        className="cursor-pointer transition hover:bg-paper/70"
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-ink">{item.nome}</p>
                          <p className="text-xs text-ink/50">
                            {nomeCategoriaAcesso(item.categoria)}
                            {item.escopo === 'rede' ? ' · Compartilhado da Rede' : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-ink/75 font-medium">
                          {item.responsavelNome}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-ink/60">
                          {formatarData(millis)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <Selo tom={estaVencida ? 'alerta' : 'lima'}>
                            {estaVencida ? 'Vencida' : 'Em dia'}
                          </Selo>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Card Lateral de Solicitações */}
        <aside className="space-y-4">
          <div className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-bold text-ink">Solicitações</h3>
              <Link
                to="/senhas/solicitacoes"
                className="text-xs font-semibold text-brand hover:underline"
              >
                Ver todas ({solicitacoes.length})
              </Link>
            </div>

            <div className="mt-3 space-y-3">
              {solicitacoesRecentes.length === 0 ? (
                <p className="py-4 text-center text-xs text-ink/50">
                  Nenhuma solicitação de acesso recente.
                </p>
              ) : (
                solicitacoesRecentes.map((sol) => (
                  <div
                    key={sol.id}
                    className="flex items-start justify-between gap-2 rounded-2xl border border-line/60 bg-paper/40 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-ink">
                        {sol.acessoNome || 'Novo sistema'}
                        {sol.alvoNome ? ` · ${sol.alvoNome}` : ''}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink/50">
                        {sol.solicitadoPorNome} · {formatarData(paraMillis(sol.criadoEm))}
                      </p>
                    </div>
                    {sol.status === 'aberta' && !comoFranqueado && (user?.papel === 'franqueado' || ehAdmin) ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const acessoRelacionado = acessos.find((a) => a.id === sol.acessoId)
                          await decidirSolicitacaoAcesso(user, sol, 'aprovada', acessoRelacionado)
                        }}
                        className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-bold text-brand hover:bg-brand hover:text-white transition"
                      >
                        Aprovar
                      </button>
                    ) : (
                      <Selo
                        tom={
                          sol.status === 'aprovada' || sol.status === 'concluida'
                            ? 'lima'
                            : sol.status === 'aberta'
                            ? 'marca'
                            : 'alerta'
                        }
                      >
                        {nomeStatusSolicitacao(sol.status)}
                      </Selo>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 rounded-xl border border-line/60 bg-paper/60 p-3 text-[11px] text-ink/65 leading-relaxed">
              <span className="font-semibold text-ink">Regra de segurança:</span> Quando alguém sai da
              equipe, a senha é trocada no mesmo dia e o acesso antigo é encerrado.
            </div>
          </div>
        </aside>
      </div>

      {/* Modais */}
      <ModalNovoSistema
        aberto={modalNovoAberto}
        aoFechar={() => setModalNovoAberto(false)}
        usuario={user}
        unidadeId={unidadeId || ''}
        unidadeNome={unidadeNome}
        ehAdminOuFranqueadora={rede}
        membrosEquipe={equipeUnidade}
        aoSalvar={() => {
          // Atualizado via listener em tempo real
        }}
      />

      <ModalSolicitacao
        aberto={modalPedirAberto}
        aoFechar={() => setModalPedirAberto(false)}
        usuario={user}
        unidadeId={unidadeId || ''}
        unidadeNome={unidadeNome}
        acessos={acessos}
        membrosEquipe={equipeUnidade}
        aoSalvar={() => {
          // Atualizado via listener em tempo real
        }}
      />

      <ModalDetalheAcesso
        acesso={acessoSelecionado}
        aoFechar={() => setAcessoSelecionado(null)}
        usuario={user}
        comoFranqueado={comoFranqueado}
        ehAdminOuFranqueadora={rede}
        aoAtualizado={() => {
          // Atualizado via listener em tempo real
        }}
      />
    </div>
  )
}
