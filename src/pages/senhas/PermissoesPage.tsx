import { useEffect, useState } from 'react'
import { Aviso, Button, Carregando, Selo, Vazio } from '../../components/ui'
import {
  nomeCategoriaAcesso,
  podeGerenciarAcesso,
  senhaVencida,
} from '../../data/senhas'
import {
  atualizarMetadadosAcesso,
  observarAcessos,
  type Acesso,
} from '../../lib/senhas'
import { listarEquipeDaUnidade } from '../../lib/gestao'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData, paraMillis } from '../../lib/format'
import { useVisao } from '../../lib/visao'
import type { Usuario } from '../../types'
import { ModalDetalheAcesso } from './ModalDetalheAcesso'

export function PermissoesPage() {
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user

  const rede = Boolean(user && (user.papel === 'admin' || user.papel === 'equipe_franqueadora') && !comoFranqueado)
  const unidadeId = rede ? null : pessoa?.unidadeId ?? null

  const [acessos, setAcessos] = useState<Acesso[]>([])
  const [equipe, setEquipe] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  // Estado editável de permissões por acesso: id -> { visivelParaEquipe, visivelPara }
  const [permissoesEditadas, setPermissoesEditadas] = useState<
    Record<string, { visivelParaEquipe: boolean; visivelPara: string[] }>
  >({})
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  const [acessoParaTroca, setAcessoParaTroca] = useState<Acesso | null>(null)

  useEffect(() => {
    if (!unidadeId) {
      setEquipe([])
      return
    }
    void listarEquipeDaUnidade(unidadeId)
      .then((membros) => setEquipe(membros))
      .catch(() => setEquipe([]))
  }, [unidadeId])

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
        setPermissoesEditadas((prev) => {
          const proximo: Record<string, { visivelParaEquipe: boolean; visivelPara: string[] }> = {}
          for (const item of itens) {
            const local = prev[item.id]
            const sujo =
              local &&
              (local.visivelParaEquipe !== item.visivelParaEquipe ||
                local.visivelPara.length !== item.visivelPara.length ||
                local.visivelPara.some((uid) => !item.visivelPara.includes(uid)) ||
                item.visivelPara.some((uid) => !local.visivelPara.includes(uid)))
            proximo[item.id] = sujo
              ? local
              : {
                  visivelParaEquipe: item.visivelParaEquipe,
                  visivelPara: [...item.visivelPara],
                }
          }
          return proximo
        })
        setCarregando(false)
      },
      (falha) => {
        setErro(mensagemErro(falha))
        setCarregando(false)
      },
    )
    return unsub
  }, [user, rede, unidadeId])

  function alternarEquipeToda(acessoId: string, valor: boolean) {
    setPermissoesEditadas((prev) => ({
      ...prev,
      [acessoId]: {
        ...(prev[acessoId] || { visivelPara: [] }),
        visivelParaEquipe: valor,
      },
    }))
  }

  function alternarMembro(acessoId: string, uid: string) {
    setPermissoesEditadas((prev) => {
      const atual = prev[acessoId] || { visivelParaEquipe: false, visivelPara: [] }
      const existe = atual.visivelPara.includes(uid)
      const novaLista = existe ? atual.visivelPara.filter((id) => id !== uid) : [...atual.visivelPara, uid]
      return {
        ...prev,
        [acessoId]: {
          ...atual,
          visivelPara: novaLista,
        },
      }
    })
  }

  async function salvarPermissoes(acesso: Acesso) {
    if (!user || comoFranqueado) return
    const edicao = permissoesEditadas[acesso.id]
    if (!edicao) return

    setSalvandoId(acesso.id)
    setErro('')
    setSucesso('')
    try {
      await atualizarMetadadosAcesso(user, acesso, {
        visivelPara: edicao.visivelPara,
        visivelParaEquipe: edicao.visivelParaEquipe,
      })
      setSucesso(`Permissões do sistema "${acesso.nome}" atualizadas com sucesso.`)
      setTimeout(() => setSucesso(''), 4000)
    } catch (falha: unknown) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvandoId(null)
    }
  }

  const podeEditarItem = (acesso: { escopo: string; unidadeId: string }) => Boolean(user && podeGerenciarAcesso(user, acesso, comoFranqueado))

  if (!user) return null
  if (comoFranqueado && !simulado) {
    return <Aviso>Escolha qual franqueado simular para ver as permissões dessa unidade.</Aviso>
  }
  if (!rede && !unidadeId) {
    return <Aviso tom="erro">Esta conta não está ligada a uma unidade.</Aviso>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Cabeçalho */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">
          Central de Acessos e Senhas
        </p>
        <h1 className="text-2xl font-black text-ink">Permissões de Acesso aos Sistemas</h1>
        <p className="mt-0.5 text-sm text-ink/65">
          Defina exatamente quem da equipe pode ver a senha de cada sistema e gerencie desligamentos.
        </p>
      </div>

      {/* Alerta de Desligamento Obrigatório */}
      <div className="rounded-2xl border border-brand/30 bg-brand/10 p-4 shadow-sm text-sm text-ink">
        <div className="flex items-start gap-3">
          <Selo tom="alerta">Atenção</Selo>
          <div>
            <h2 className="font-bold">Política de Segurança da Rede Ubox: Desligamento na equipe</h2>
            <p className="mt-1 leading-relaxed text-xs text-ink/70">
              Quando alguém sai da equipe, aprove a revogação para encerrar o acesso (inclusive se a senha
              era visível para toda a equipe) e trocar a senha do cofre no mesmo passo.
            </p>
          </div>
        </div>
      </div>

      {comoFranqueado ? (
        <Aviso>
          Modo de visualização do franqueado. A alteração de permissões fica desabilitada nesta simulação.
        </Aviso>
      ) : null}

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {sucesso ? <Aviso tom="ok">{sucesso}</Aviso> : null}

      {/* Lista de Sistemas e Permissões */}
      {carregando ? (
        <div className="p-8">
          <Carregando texto="Carregando permissões dos sistemas…" />
        </div>
      ) : acessos.length === 0 ? (
        <Vazio
          titulo="Nenhum sistema no cofre"
          texto="Cadastre sistemas no cofre para definir as permissões de visualização da equipe."
        />
      ) : (
        <div className="space-y-4">
          {acessos.map((acesso) => {
            const edicao = permissoesEditadas[acesso.id] || {
              visivelParaEquipe: acesso.visivelParaEquipe,
              visivelPara: acesso.visivelPara,
            }
            const estaVencida = senhaVencida(paraMillis(acesso.ultimaTrocaEm), Date.now(), acesso.pendenteTroca)

            // Verifica se há membros inativos com permissão neste acesso
            const membrosInativosComAcesso = equipe.filter(
              (m) => !m.ativo && edicao.visivelPara.includes(m.uid),
            )

            const houveAlteracao =
              edicao.visivelParaEquipe !== acesso.visivelParaEquipe ||
              edicao.visivelPara.length !== acesso.visivelPara.length ||
              edicao.visivelPara.some((uid) => !acesso.visivelPara.includes(uid))

            const emSalvamento = salvandoId === acesso.id

            return (
              <article
                key={acesso.id}
                className="rounded-3xl border border-line bg-white p-5 shadow-sm space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Selo tom={estaVencida ? 'alerta' : 'lima'}>
                        {estaVencida ? 'Vencida' : 'Em dia'}
                      </Selo>
                      <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink/75">
                        {nomeCategoriaAcesso(acesso.categoria)}
                      </span>
                      {acesso.pendenteTroca ? (
                        <Selo tom="alerta">Troca pendente pós-revogação</Selo>
                      ) : null}
                    </div>
                    <h3 className="mt-1 text-base font-bold text-ink">{acesso.nome}</h3>
                    <p className="text-xs text-ink/50">
                      Responsável: {acesso.responsavelNome} · Última troca em{' '}
                      {formatarData(paraMillis(acesso.ultimaTrocaEm))}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {podeEditarItem(acesso) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setAcessoParaTroca(acesso)}
                      className="text-xs py-1.5 px-3"
                    >
                      Trocar senha agora
                    </Button>
                    ) : null}
                    {podeEditarItem(acesso) && houveAlteracao ? (
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => salvarPermissoes(acesso)}
                        disabled={emSalvamento}
                        className="text-xs py-1.5 px-3"
                      >
                        {emSalvamento ? 'Salvando…' : 'Salvar permissões'}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* Alerta de membro inativo com acesso */}
                {membrosInativosComAcesso.length > 0 && acesso.escopo === 'unidade' ? (
                  <div className="rounded-2xl border border-brand/30 bg-brand/10 p-3 text-xs text-ink space-y-1">
                    <p className="font-bold text-brand-dark">Risco de segurança detectado:</p>
                    <p>
                      O(s) colaborador(es) inativo(s){' '}
                      <span className="font-semibold">
                        {membrosInativosComAcesso.map((m) => m.nome).join(', ')}
                      </span>{' '}
                      ainda constam na lista de visualização deste sistema. Desmarque-os e rotacione a senha
                      imediatamente.
                    </p>
                  </div>
                ) : null}

                {/* Opções de permissão */}
                {acesso.escopo === 'rede' ? (
                  <div className="rounded-2xl border border-brand/20 bg-paper p-3 text-xs text-ink/70 leading-relaxed">
                    Este acesso é da rede e o segredo é compartilhado com todas as unidades que têm o módulo
                    Central de Acessos e Senhas. Não há lista individual de visualização.
                  </div>
                ) : (
                <div className="space-y-3 pt-1">
                  <label className="flex items-center gap-2.5 text-xs text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={edicao.visivelParaEquipe}
                      onChange={(e) => alternarEquipeToda(acesso.id, e.target.checked)}
                      disabled={!podeEditarItem(acesso)}
                      className="h-4 w-4 rounded text-brand focus:ring-brand"
                    />
                    <span className="font-semibold">
                      Liberar visualização para toda a equipe da unidade com módulo Central de Senhas
                    </span>
                  </label>

                  {!edicao.visivelParaEquipe ? (
                    <div className="rounded-2xl border border-line bg-paper/50 p-3 space-y-2">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-ink/50">
                        Pessoas autorizadas a ver esta senha:
                      </span>
                      {equipe.length === 0 ? (
                        <p className="text-xs text-ink/50">Nenhum membro da equipe cadastrado na unidade.</p>
                      ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                          {equipe.map((membro) => {
                            const temAcesso = edicao.visivelPara.includes(membro.uid)
                            return (
                              <label
                                key={membro.uid}
                                className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs cursor-pointer transition ${
                                  temAcesso
                                    ? 'border-brand/40 bg-brand/5 text-ink'
                                    : 'border-line bg-white text-ink/70'
                                } ${!membro.ativo ? 'border-brand/40 bg-brand/10' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={temAcesso}
                                  onChange={() => alternarMembro(acesso.id, membro.uid)}
                                  disabled={!podeEditarItem(acesso)}
                                  className="rounded text-brand focus:ring-brand"
                                />
                                <div className="min-w-0 flex-1 truncate">
                                  <p className="font-medium truncate">{membro.nome}</p>
                                  <p className="text-[10px] text-ink/40">
                                    {membro.ativo ? 'Ativo' : 'Inativo / Desligado'}
                                  </p>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {/* Modal para troca de senha */}
      <ModalDetalheAcesso
        acesso={acessoParaTroca}
        aoFechar={() => setAcessoParaTroca(null)}
        usuario={user}
        comoFranqueado={comoFranqueado}
        ehAdminOuFranqueadora={rede}
        aoAtualizado={() => {
          // Listener em tempo real atualiza os dados
        }}
      />
    </div>
  )
}
