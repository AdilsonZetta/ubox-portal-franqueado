import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Aviso, Button, Campo, Selo, inputClass } from '../../components/ui'
import {
  CATEGORIAS_ACESSO,
  nomeCategoriaAcesso,
  senhaVencida,
  podeGerenciarAcesso,
  textoEventoAcesso,
  usuarioPodeVerSegredo,
  type CategoriaAcesso,
} from '../../data/senhas'
import {
  atualizarMetadadosAcesso,
  buscarSegredo,
  gravarEventoAcesso,
  observarEventosAcesso,
  trocarSenhaAcesso,
  type Acesso,
  type EventoAcesso,
  type SegredoAcesso,
} from '../../lib/senhas'
import type { Usuario } from '../../types'
import { mensagemErro } from '../../lib/errors'
import { formatarData, paraMillis } from '../../lib/format'

interface ModalDetalheAcessoProps {
  acesso: Acesso | null
  aoFechar: () => void
  usuario: Usuario
  comoFranqueado: boolean
  ehAdminOuFranqueadora: boolean
  aoAtualizado: () => void
}

export function ModalDetalheAcesso({
  acesso,
  aoFechar,
  usuario,
  comoFranqueado,
  ehAdminOuFranqueadora,
  aoAtualizado,
}: ModalDetalheAcessoProps) {
  const [segredo, setSegredo] = useState<SegredoAcesso | null>(null)
  const [revelado, setRevelado] = useState(false)
  const [carregandoSegredo, setCarregandoSegredo] = useState(false)
  const [copiadoSenha, setCopiadoSenha] = useState(false)
  const [copiadoLogin, setCopiadoLogin] = useState(false)
  const [erro, setErro] = useState('')
  const [eventos, setEventos] = useState<EventoAcesso[]>([])

  // Estado do formulário de troca de senha
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [novoLogin, setNovoLogin] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novasNotas, setNovasNotas] = useState('')
  const [salvandoTroca, setSalvandoTroca] = useState(false)

  // Estado de edição de metadados
  const [editando, setEditando] = useState(false)
  const [editNome, setEditNome] = useState('')
  const [editCategoria, setEditCategoria] = useState<CategoriaAcesso>('gestao')
  const [editUrl, setEditUrl] = useState('')
  const [editResponsavel, setEditResponsavel] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Limpa segredo e revelação ao trocar de acesso ou fechar
  useEffect(() => {
    setSegredo(null)
    setRevelado(false)
    setCopiadoSenha(false)
    setCopiadoLogin(false)
    setErro('')
    setTrocandoSenha(false)
    setEditando(false)

    if (acesso) {
      setEditNome(acesso.nome)
      setEditCategoria(acesso.categoria)
      setEditUrl(acesso.url)
      setEditResponsavel(acesso.responsavelNome)
      setTimeout(() => dialogRef.current?.focus(), 50)
    }
  }, [acesso])

  // Ouve eventos do acesso
  useEffect(() => {
    if (!acesso) return
    return observarEventosAcesso(acesso.id, setEventos, (falha) => {
      console.warn('Erro ao carregar eventos:', falha)
    })
  }, [acesso])

  // Temporizador para auto-ocultar a senha após 30 segundos
  useEffect(() => {
    if (!revelado) return
    const timer = setTimeout(() => {
      setRevelado(false)
    }, 30_000)
    return () => clearTimeout(timer)
  }, [revelado])

  useEffect(() => {
    if (!acesso) return
    function aoTecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !salvandoTroca && !salvandoEdicao) {
        aoFechar()
      }
    }
    window.addEventListener('keydown', aoTecla)
    return () => window.removeEventListener('keydown', aoTecla)
  }, [acesso, salvandoTroca, salvandoEdicao, aoFechar])

  if (!acesso) return null

  const millisTroca = paraMillis(acesso.ultimaTrocaEm)
  const vencida = senhaVencida(millisTroca, Date.now(), acesso.pendenteTroca)

  const podeLerSegredo = usuarioPodeVerSegredo(
    {
      uid: usuario.uid,
      papel: usuario.papel,
      unidadeId: usuario.unidadeId,
      modulosLiberados: usuario.modulosLiberados,
    },
    {
      escopo: acesso.escopo,
      unidadeId: acesso.unidadeId,
      visivelPara: acesso.visivelPara,
      visivelParaEquipe: acesso.visivelParaEquipe,
      ultimaTrocaEmMillis: millisTroca,
      pendenteTroca: acesso.pendenteTroca,
    },
    comoFranqueado,
  )

  const podeGerenciar = podeGerenciarAcesso(usuario, acesso, comoFranqueado)

  async function obterSegredo(): Promise<SegredoAcesso> {
    if (segredo) return segredo
    setCarregandoSegredo(true)
    try {
      return await buscarSegredo(acesso!.id)
    } finally {
      setCarregandoSegredo(false)
    }
  }

  function aplicarSegredo(dados: SegredoAcesso) {
    setSegredo(dados)
    setNovoLogin(dados.login)
    setNovasNotas(dados.notas)
  }

  async function handleRevelar() {
    if (!podeLerSegredo) return
    setErro('')
    try {
      const dados = await obterSegredo()
      await gravarEventoAcesso(acesso!.id, usuario, 'revelou')
      aplicarSegredo(dados)
      setRevelado(true)
    } catch (falha: unknown) {
      setErro(mensagemErro(falha))
    }
  }

  async function handleCopiarSenha() {
    if (!podeLerSegredo) return
    setErro('')
    try {
      const dados = await obterSegredo()
      await gravarEventoAcesso(acesso!.id, usuario, 'copiou')
      aplicarSegredo(dados)
      await navigator.clipboard.writeText(dados.senha)
      setCopiadoSenha(true)
      setTimeout(() => setCopiadoSenha(false), 2500)
    } catch (falha: unknown) {
      setErro(mensagemErro(falha))
    }
  }

  async function handleCopiarLogin(textoLogin: string) {
    try {
      await navigator.clipboard.writeText(textoLogin)
      setCopiadoLogin(true)
      setTimeout(() => setCopiadoLogin(false), 2000)
    } catch {
      // Fallback simples
    }
  }

  async function submeterTrocaSenha(evento: FormEvent) {
    evento.preventDefault()
    if (!podeGerenciar) return
    if (!novaSenha.trim()) {
      setErro('A nova senha não pode ser vazia.')
      return
    }

    setSalvandoTroca(true)
    setErro('')
    try {
      await trocarSenhaAcesso(usuario, acesso!.id, {
        login: novoLogin.trim(),
        senha: novaSenha,
        notas: novasNotas.trim(),
      })
      setSegredo({
        login: novoLogin.trim(),
        senha: novaSenha,
        notas: novasNotas.trim(),
        atualizadoPor: usuario.uid,
      })
      setNovaSenha('')
      setTrocandoSenha(false)
      aoAtualizado()
    } catch (falha: unknown) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvandoTroca(false)
    }
  }

  async function submeterEdicao(evento: FormEvent) {
    evento.preventDefault()
    if (!podeGerenciar) return

    const urlTrim = editUrl.trim()
    if (urlTrim && !urlTrim.startsWith('https://')) {
      setErro('A URL precisa começar com https://')
      return
    }

    setSalvandoEdicao(true)
    setErro('')
    try {
      await atualizarMetadadosAcesso(usuario, acesso!, {
        nome: editNome.trim(),
        categoria: editCategoria,
        url: urlTrim,
        responsavelNome: editResponsavel.trim(),
      })
      setEditando(false)
      aoAtualizado()
    } catch (falha: unknown) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvandoEdicao(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-detalhe-acesso"
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line bg-white p-6 shadow-2xl outline-none"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Selo tom={vencida ? 'alerta' : 'lima'}>{vencida ? 'Vencida' : 'Em dia'}</Selo>
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-ink/70">
                {nomeCategoriaAcesso(acesso.categoria)}
              </span>
              <span className="text-xs text-ink/40">
                {acesso.escopo === 'rede' ? 'Rede Ubox' : acesso.unidadeNome || 'Unidade'}
              </span>
            </div>
            <h2 id="titulo-detalhe-acesso" className="mt-1.5 text-2xl font-black text-ink">{acesso.nome}</h2>
            {acesso.url ? (
              <a
                href={acesso.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                Abrir sistema no navegador ↗
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-ink/40 hover:bg-paper hover:text-ink"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {erro ? <div className="mt-4"><Aviso tom="erro">{erro}</Aviso></div> : null}

        {/* Informações principais */}
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Responsável</p>
              <p className="mt-1 font-semibold text-ink">{acesso.responsavelNome}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Última troca</p>
              <p className="mt-1 font-semibold text-ink">{formatarData(millisTroca)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Status de rotação</p>
              <p className="mt-1 font-semibold text-ink">
                {vencida ? (acesso.pendenteTroca ? 'Troca pendente' : 'Mais de 90 dias') : 'Dentro do prazo'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Visibilidade</p>
              <p className="mt-1 font-semibold text-ink">
                {acesso.escopo === 'rede'
                  ? 'Todas as unidades com o módulo'
                  : acesso.visivelParaEquipe
                    ? 'Toda a equipe'
                    : `${acesso.visivelPara.length} ${acesso.visivelPara.length === 1 ? 'pessoa' : 'pessoas'}`}
              </p>
            </div>
          </div>

          {/* Seção do Segredo */}
          <div className="rounded-2xl border border-line bg-paper/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">Dados confidenciais de acesso</h3>
                <p className="text-xs text-ink/60">
                  Acesso protegido por regras oficiais. Ações de visualização são registradas no histórico.
                </p>
              </div>
              {revelado ? (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand-dark">
                  Visível (auto-oculta em 30s)
                </span>
              ) : null}
            </div>

            {comoFranqueado ? (
              <div className="mt-3">
                <Aviso>
                  Você está em modo de simulação de franqueado. As credenciais e os botões de revelação ficam
                  desabilitados por segurança.
                </Aviso>
              </div>
            ) : !podeLerSegredo ? (
              <div className="mt-3">
                <Aviso>
                  {ehAdminOuFranqueadora
                    ? 'Por política de segurança da rede, as senhas das unidades são restritas aos próprios franqueados. A franqueadora visualiza apenas os metadados e histórico de rotação.'
                    : 'Você não tem permissão para visualizar o segredo deste sistema. Peça acesso ao franqueado da unidade.'}
                </Aviso>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {/* Campo de Login */}
                <div>
                  <span className="block text-xs font-semibold text-ink/60">Usuário / Login</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      readOnly
                      value={revelado && segredo ? segredo.login : '••••••••'}
                      className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none"
                    />
                    {revelado && segredo ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleCopiarLogin(segredo.login)}
                        className="shrink-0 text-xs"
                      >
                        {copiadoLogin ? 'Copiado!' : 'Copiar login'}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* Campo de Senha */}
                <div>
                  <span className="block text-xs font-semibold text-ink/60">Senha</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      readOnly
                      type={revelado && segredo ? 'text' : 'password'}
                      value={revelado && segredo ? segredo.senha : '••••••••••••'}
                      className="w-full font-mono rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none tracking-widest"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={revelado ? () => setRevelado(false) : handleRevelar}
                      disabled={carregandoSegredo}
                      className="shrink-0 text-xs"
                    >
                      {revelado ? 'Ocultar' : carregandoSegredo ? 'Carregando…' : 'Revelar'}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleCopiarSenha}
                      disabled={carregandoSegredo}
                      className="shrink-0 text-xs"
                    >
                      {copiadoSenha ? 'Copiado!' : 'Copiar senha'}
                    </Button>
                  </div>
                </div>

                {/* Notas confidenciais */}
                {segredo?.notas ? (
                  <div className="rounded-xl border border-line bg-white p-3 text-xs text-ink/80">
                    <span className="font-semibold text-ink">Orientações de acesso:</span>
                    <p className="mt-0.5 whitespace-pre-wrap">{segredo.notas}</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Painel de Troca de Senha */}
          {trocandoSenha ? (
            <form onSubmit={submeterTrocaSenha} className="rounded-2xl border border-brand/30 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-ink">Registrar rotação de senha</h4>
                <button
                  type="button"
                  onClick={() => setTrocandoSenha(false)}
                  className="text-xs text-ink/50 hover:underline"
                >
                  Cancelar
                </button>
              </div>
              <p className="text-xs text-ink/60">
                Ao salvar a nova senha, a data de rotação é atualizada para hoje e qualquer pendência de troca é resolvida.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Login">
                  <input
                    required
                    maxLength={200}
                    className={inputClass}
                    value={novoLogin}
                    onChange={(e) => setNovoLogin(e.target.value)}
                  />
                </Campo>
                <Campo label="Nova senha">
                  <input
                    required
                    type="password"
                    maxLength={500}
                    placeholder="••••••••••••"
                    className={inputClass}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                  />
                </Campo>
              </div>
              <Campo label="Notas e instruções atualizadas (opcional)">
                <textarea
                  rows={2}
                  maxLength={2000}
                  className={inputClass}
                  value={novasNotas}
                  onChange={(e) => setNovasNotas(e.target.value)}
                />
              </Campo>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setTrocandoSenha(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvandoTroca}>
                  {salvandoTroca ? 'Salvando…' : 'Confirmar troca de senha'}
                </Button>
              </div>
            </form>
          ) : null}

          {/* Painel de Edição de Metadados */}
          {editando ? (
            <form onSubmit={submeterEdicao} className="rounded-2xl border border-line bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-ink">Editar dados do sistema</h4>
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="text-xs text-ink/50 hover:underline"
                >
                  Cancelar
                </button>
              </div>
              <Campo label="Nome">
                <input
                  required
                  maxLength={120}
                  className={inputClass}
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                />
              </Campo>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Categoria">
                  <select
                    className={inputClass}
                    value={editCategoria}
                    onChange={(e) => setEditCategoria(e.target.value as CategoriaAcesso)}
                  >
                    {CATEGORIAS_ACESSO.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Responsável">
                  <input
                    required
                    maxLength={120}
                    className={inputClass}
                    value={editResponsavel}
                    onChange={(e) => setEditResponsavel(e.target.value)}
                  />
                </Campo>
              </div>
              <Campo label="URL">
                <input
                  type="url"
                  className={inputClass}
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                />
              </Campo>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvandoEdicao}>
                  {salvandoEdicao ? 'Salvando…' : 'Salvar alterações'}
                </Button>
              </div>
            </form>
          ) : null}

          {/* Histórico e Auditoria */}
          <div className="rounded-2xl border border-line bg-white p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink/50">Histórico de auditoria</h4>
            {eventos.length === 0 ? (
              <p className="mt-2 text-xs text-ink/50">Nenhum evento registrado ainda.</p>
            ) : (
              <div className="mt-3 max-h-40 overflow-y-auto space-y-2 pr-1">
                {eventos.map((ev) => (
                  <div key={ev.id} className="flex items-start justify-between border-b border-line/40 pb-1.5 text-xs">
                    <div>
                      <span className="font-semibold text-ink">{ev.autorNome}</span>
                      <span className="text-ink/60"> — {textoEventoAcesso(ev.tipo)}</span>
                    </div>
                    <span className="shrink-0 text-[10px] text-ink/40">
                      {formatarData(paraMillis(ev.criadoEm))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé com Ações */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <div className="flex items-center gap-2">
            {podeGerenciar && !trocandoSenha ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void obterSegredo()
                    .then((dados) => aplicarSegredo(dados))
                    .catch((falha: unknown) => setErro(mensagemErro(falha)))
                    .finally(() => setTrocandoSenha(true))
                }}
              >
                Trocar senha
              </Button>
            ) : null}
            {podeGerenciar && !editando ? (
              <Button type="button" variant="secondary" onClick={() => setEditando(true)}>
                Editar sistema
              </Button>
            ) : null}
          </div>
          <Button type="button" variant="secondary" onClick={aoFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  )
}
