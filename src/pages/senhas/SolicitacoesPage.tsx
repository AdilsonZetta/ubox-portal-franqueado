import { useEffect, useMemo, useState } from 'react'
import { Aviso, Button, Carregando, Selo, Vazio } from '../../components/ui'
import {
  STATUS_SOLICITACAO,
  TIPOS_SOLICITACAO,
  nomeStatusSolicitacao,
  nomeTipoSolicitacao,
} from '../../data/senhas'
import {
  decidirSolicitacaoAcesso,
  observarAcessos,
  observarSolicitacoes,
  type Acesso,
  type SolicitacaoAcesso,
} from '../../lib/senhas'
import { useEquipeCofre } from './useEquipeCofre'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData, paraMillis } from '../../lib/format'
import { useVisao } from '../../lib/visao'
import { ModalSolicitacao } from './ModalSolicitacao'
import { ModalAprovarRevogacao } from './ModalAprovarRevogacao'

export function SolicitacoesPage() {
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user

  const rede = Boolean(user && (user.papel === 'admin' || user.papel === 'equipe_franqueadora') && !comoFranqueado)
  const unidadeId = rede ? null : pessoa?.unidadeId ?? null
  const unidadeNome = (comoFranqueado ? simulado?.unidade : user?.unidade) || 'Unidade'

  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoAcesso[]>([])
  const [acessos, setAcessos] = useState<Acesso[]>([])
  const equipeCofre = useEquipeCofre(unidadeId)
  const equipeUnidade = equipeCofre.membros
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [erroLista, setErroLista] = useState(false)
  const [estadoSistemas, setEstadoSistemas] = useState<'carregando' | 'erro' | 'ok'>('carregando')
  const [tentativa, setTentativa] = useState(0)

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [filtroTipo, setFiltroTipo] = useState<string>('')
  const [busca, setBusca] = useState('')

  // Modal nova solicitação
  const [modalNovaAberto, setModalNovaAberto] = useState(false)
  const [processandoId, setProcessandoId] = useState<string | null>(null)
  const [solicitacaoRevogar, setSolicitacaoRevogar] = useState<SolicitacaoAcesso | null>(null)

  useEffect(() => {
    if (!user || (!rede && !unidadeId)) {
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErroLista(false)
    const unsubSol = observarSolicitacoes(
      { rede, unidadeId },
      (itens) => {
        setErroLista(false)
        setSolicitacoes(itens)
        setCarregando(false)
      },
      () => {
        setErroLista(true)
        setCarregando(false)
      },
    )
    setEstadoSistemas('carregando')
    const unsubAc = observarAcessos(
      { rede, unidadeId },
      (itens) => { setAcessos(itens); setEstadoSistemas('ok') },
      () => setEstadoSistemas('erro'),
    )
    return () => {
      unsubSol()
      unsubAc()
    }
  }, [user, rede, unidadeId, tentativa])

  const solicitacoesFiltradas = useMemo(() => {
    return solicitacoes.filter((item) => {
      if (filtroStatus && item.status !== filtroStatus) return false
      if (filtroTipo && item.tipo !== filtroTipo) return false
      if (busca.trim()) {
        const termo = busca.toLowerCase()
        const matchSistema = item.acessoNome.toLowerCase().includes(termo)
        const matchSolicitante = item.solicitadoPorNome.toLowerCase().includes(termo)
        const matchAlvo = item.alvoNome.toLowerCase().includes(termo)
        const matchMotivo = item.motivo.toLowerCase().includes(termo)
        if (!matchSistema && !matchSolicitante && !matchAlvo && !matchMotivo) return false
      }
      return true
    })
  }, [solicitacoes, filtroStatus, filtroTipo, busca])

  async function handleDecidir(
    sol: SolicitacaoAcesso,
    novoStatus: 'aprovada' | 'recusada' | 'concluida',
  ) {
    if (!user || comoFranqueado || processandoId || estadoSistemas !== 'ok') return
    if (novoStatus === 'aprovada' && sol.tipo === 'revogar') {
      setSolicitacaoRevogar(sol)
      return
    }
    if (novoStatus === 'aprovada' && !window.confirm(`Aprovar a solicitação de ${sol.solicitadoPorNome} para ${sol.acessoNome || 'um novo sistema'}?`)) return
    setProcessandoId(sol.id)
    setErro('')
    try {
      const acessoRelacionado = acessos.find((a) => a.id === sol.acessoId) ?? null
      await decidirSolicitacaoAcesso(user, sol, novoStatus, acessoRelacionado)
    } catch (falha: unknown) {
      setErro(mensagemErro(falha))
    } finally {
      setProcessandoId(null)
    }
  }

  const podeDecidir = !comoFranqueado && user?.papel === 'franqueado' && Boolean(unidadeId)

  if (!user) return null
  if (comoFranqueado && !simulado) {
    return <Aviso>Escolha qual franqueado simular para ver as solicitações dessa unidade.</Aviso>
  }
  if (!rede && !unidadeId) {
    return <Aviso tom="erro">Esta conta não está ligada a uma unidade.</Aviso>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">
            Central de Acessos e Senhas
          </p>
          <h1 className="text-2xl font-black text-ink">Solicitações de Acesso</h1>
          <p className="mt-0.5 text-sm text-ink/65">
            Pedidos de acesso, homologação de novos sistemas, revogação por desligamento e trocas de senha.
          </p>
        </div>
        {unidadeId ? (
        <Button
          type="button"
          variant="primary"
          onClick={() => setModalNovaAberto(true)}
          disabled={comoFranqueado || estadoSistemas !== 'ok' || equipeCofre.carregando || equipeCofre.erro}
        >
          <span className="font-bold">+</span> Nova solicitação
        </Button>
        ) : null}
      </div>

      {comoFranqueado ? (
        <Aviso>
          Modo de visualização do franqueado. Nesta simulação, você pode consultar solicitações. Criar ou decidir pedidos fica desabilitado.
        </Aviso>
      ) : null}

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {equipeCofre.carregando ? <Carregando texto="Carregando a equipe da unidade…" /> : equipeCofre.erro ? (
        <div className="space-y-2">
          <Aviso tom="erro">Não foi possível carregar a equipe da unidade.</Aviso>
          <Button type="button" variant="secondary" onClick={equipeCofre.recarregar}>Tentar novamente</Button>
        </div>
      ) : null}

      {estadoSistemas === 'carregando' && !carregando ? <Carregando texto="Carregando os sistemas relacionados…" /> : null}
      {estadoSistemas === 'erro' ? (
        <div className="space-y-2">
          <Aviso tom="erro">Não foi possível carregar os sistemas relacionados às solicitações.</Aviso>
          <Button type="button" variant="secondary" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button>
        </div>
      ) : null}

      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm">
        <input
          type="search"
          placeholder="Buscar por sistema, pessoa ou motivo…"
          className="min-w-[200px] flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:bg-white"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select
          className="rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:bg-white"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
        >
          <option value="">Todos os status</option>
          {STATUS_SOLICITACAO.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink outline-none focus:border-brand focus:bg-white"
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {TIPOS_SOLICITACAO.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </select>
      </div>

      {/* Lista de Solicitações */}
      {carregando ? (
        <div className="p-8">
          <Carregando texto="Carregando solicitações…" />
        </div>
      ) : erroLista ? (
        <div className="space-y-2 p-4">
          <Aviso tom="erro">Não foi possível carregar as solicitações.</Aviso>
          <Button type="button" variant="secondary" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button>
        </div>
      ) : solicitacoesFiltradas.length === 0 ? (
        <Vazio
          titulo="Nenhuma solicitação encontrada"
          texto={
            busca || filtroStatus || filtroTipo
              ? 'Nenhum pedido corresponde aos filtros aplicados.'
              : 'Nenhuma solicitação em aberto ou registrada até o momento.'
          }
        />
      ) : (
        <div className="space-y-3">
          {solicitacoesFiltradas.map((sol) => {
            const ehAberta = sol.status === 'aberta'
            const emProcessamento = processandoId === sol.id
            return (
              <article
                key={sol.id}
                className="rounded-2xl border border-line bg-white p-5 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink/75">
                        {nomeTipoSolicitacao(sol.tipo)}
                      </span>
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
                      <span className="text-xs text-ink/40">
                        {rede ? `${sol.unidadeNome} · ` : ''}
                        {formatarData(paraMillis(sol.criadoEm))}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-bold text-ink">
                      {sol.acessoNome || 'Novo sistema solicitado'}
                      {sol.alvoNome ? ` · ${sol.alvoNome}` : ''}
                    </h3>
                  </div>

                  {ehAberta && podeDecidir ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => handleDecidir(sol, 'aprovada')}
                        disabled={Boolean(processandoId) || estadoSistemas !== 'ok'}
                        className="text-xs py-1.5 px-3"
                      >
                        {emProcessamento ? 'Salvando…' : 'Aprovar'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleDecidir(sol, 'recusada')}
                        disabled={Boolean(processandoId) || estadoSistemas !== 'ok'}
                        className="text-xs py-1.5 px-3"
                      >
                        Recusar
                      </Button>
                      {sol.tipo === 'novo_sistema' || sol.tipo === 'trocar_senha' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => handleDecidir(sol, 'concluida')}
                          disabled={Boolean(processandoId) || estadoSistemas !== 'ok'}
                          className="text-xs py-1.5 px-3"
                        >
                          Concluir
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="text-xs text-ink/80 space-y-1">
                  <p>
                    <span className="font-semibold text-ink">Solicitado por:</span>{' '}
                    {sol.solicitadoPorNome}
                  </p>
                  {sol.alvoNome && sol.alvoNome !== sol.solicitadoPorNome ? (
                    <p>
                      <span className="font-semibold text-ink">Colaborador alvo:</span>{' '}
                      {sol.alvoNome}
                    </p>
                  ) : null}
                  <p>
                    <span className="font-semibold text-ink">Motivo / Justificativa:</span>{' '}
                    {sol.motivo}
                  </p>
                  {sol.decididoPorNome ? (
                    <p className="text-ink/50 pt-1">
                      Decidido por: {sol.decididoPorNome} em {formatarData(paraMillis(sol.atualizadoEm))}
                    </p>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Modal Nova Solicitação */}
      <ModalSolicitacao
        aberto={modalNovaAberto}
        aoFechar={() => setModalNovaAberto(false)}
        usuario={user}
        unidadeId={unidadeId || ''}
        unidadeNome={unidadeNome}
        acessos={acessos}
        membrosEquipe={equipeUnidade}
        aoSalvar={() => {
          // Atualizado via listener em tempo real
        }}
      />
      <ModalAprovarRevogacao
        aberto={Boolean(solicitacaoRevogar)}
        solicitacao={solicitacaoRevogar}
        acesso={solicitacaoRevogar ? acessos.find((item) => item.id === solicitacaoRevogar.acessoId) ?? null : null}
        aoFechar={() => setSolicitacaoRevogar(null)}
        aoConfirmar={async (novaSenha, login, notas) => {
          if (!user || !solicitacaoRevogar) return
          const acessoRelacionado = acessos.find((item) => item.id === solicitacaoRevogar.acessoId) ?? null
          await decidirSolicitacaoAcesso(user, solicitacaoRevogar, 'aprovada', acessoRelacionado, {
            novaSenha,
            login,
            notas,
          })
        }}
      />

    </div>
  )
}
