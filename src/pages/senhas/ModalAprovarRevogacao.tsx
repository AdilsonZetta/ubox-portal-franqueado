import { useEffect, useState, type FormEvent } from 'react'
import { useFocusTrap } from '../../lib/focusTrap'
import { Aviso, Button, Campo, Carregando, inputClass } from '../../components/ui'
import { buscarSegredo, type Acesso, type SolicitacaoAcesso } from '../../lib/senhas'

interface ModalAprovarRevogacaoProps {
  aberto: boolean
  solicitacao: SolicitacaoAcesso | null
  acesso: Acesso | null
  aoFechar: () => void
  aoConfirmar: (novaSenha: string, login?: string, notas?: string) => Promise<void>
}

export function ModalAprovarRevogacao({
  aberto,
  solicitacao,
  acesso,
  aoFechar,
  aoConfirmar,
}: ModalAprovarRevogacaoProps) {
  const [login, setLogin] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [notas, setNotas] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregandoSegredo, setCarregandoSegredo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [erroSegredo, setErroSegredo] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('')
  const acessoId = acesso?.id
  const solicitacaoId = solicitacao?.id

  const armadilhaRef = useFocusTrap<HTMLDivElement>(Boolean(aberto && solicitacao))

  useEffect(() => {
    setLogin('')
    setNovaSenha('')
    setConfirmacaoSenha('')
    setMostrarSenha(false)
    setNotas('')
    setErro('')
  }, [aberto, solicitacaoId])

  useEffect(() => {
    if (!aberto || !acessoId) return
    let ativo = true
    setCarregandoSegredo(true)
    setErroSegredo(false)
    void buscarSegredo(acessoId)
      .then((seg) => {
        if (!ativo) return
        setLogin(seg.login)
        setNotas(seg.notas)
      })
      .catch(() => { if (ativo) setErroSegredo(true) })
      .finally(() => { if (ativo) setCarregandoSegredo(false) })
    return () => { ativo = false }
  }, [aberto, acessoId, tentativa])

  useEffect(() => {
    if (!aberto) return
    function aoTecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !salvando) {
        aoFechar()
      }
    }
    window.addEventListener('keydown', aoTecla)
    return () => window.removeEventListener('keydown', aoTecla)
  }, [aberto, salvando, aoFechar])

  if (!aberto || !solicitacao) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (salvando || carregandoSegredo || !acessoId) return
    if (!novaSenha.trim()) {
      setErro('A nova senha é obrigatória.')
      return
    }
    if (novaSenha !== confirmacaoSenha) {
      setErro('As duas senhas precisam ser iguais.')
      return
    }
    if (erroSegredo && !window.confirm('O login e as notas atuais não foram carregados. Confirma gravar os valores informados neste formulário e revogar o acesso?')) return
    setSalvando(true)
    setErro('')
    try {
      await aoConfirmar(novaSenha.trim(), login.trim(), notas.trim())
      aoFechar()
    } catch {
      setErro('Não foi possível revogar o acesso e registrar a nova senha. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      ref={armadilhaRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-revogacao"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand">
              Rotação Imediata de Credenciais
            </p>
            <h2 id="titulo-modal-revogacao" className="mt-1 text-xl font-black text-ink">
              Aprovar Revogação de Acesso
            </h2>
            <p className="mt-0.5 text-xs text-ink/60">
              Sistema: <span className="font-semibold text-ink">{solicitacao.acessoNome}</span>
              {solicitacao.alvoNome ? (
                <> · Colaborador: <span className="font-semibold text-ink">{solicitacao.alvoNome}</span></>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            disabled={salvando}
            className="rounded-lg p-1.5 text-ink/40 hover:bg-paper hover:text-ink disabled:opacity-50"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {erro ? (
          <div className="mt-4">
            <Aviso tom="erro">{erro}</Aviso>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-brand/30 bg-brand/10 p-3 text-xs text-ink leading-relaxed">
          <p className="font-bold text-brand-dark">Proteção do cofre no desligamento:</p>
          <p className="mt-0.5 text-ink/80">
            Depois de trocar a senha no sistema externo, a aprovação encerra o acesso de{' '}
            <span className="font-semibold">{solicitacao.alvoNome || 'colaborador'}</span> no cofre e registra a nova senha no mesmo passo.
          </p>
          {acesso?.visivelParaEquipe ? (
            <p className="mt-2 font-semibold text-brand-dark" role="note">
              Atenção: este sistema está liberado para a equipe toda da unidade. Ao revogar, a opção “visível para toda a
              equipe” será desligada e só continuam vendo a senha o franqueado e as pessoas marcadas uma a uma. Se precisar,
              libere de novo quem deve continuar com acesso depois da troca.
            </p>
          ) : (
            <p className="mt-2 text-ink/70">
              A revogação mantém desligada a opção “visível para toda a equipe” deste sistema.
            </p>
          )}
        </div>

        {!acessoId ? <Aviso tom="erro">O sistema desta solicitação não está disponível.</Aviso> : null}
        {carregandoSegredo ? <Carregando texto="Carregando as credenciais atuais…" /> : erroSegredo ? (
          <div className="mt-4 space-y-2">
            <Aviso tom="erro">Não foi possível carregar o login e as notas atuais. Você pode tentar novamente ou preencher os campos antes de confirmar.</Aviso>
            <Button type="button" variant="secondary" disabled={salvando} onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</Button>
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <Campo label="Usuário / Login no sistema">
            <input
              maxLength={200}
              placeholder="admin@unidade"
              className={inputClass}
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              disabled={salvando || carregandoSegredo}
            />
          </Campo>

          <Campo
            label="Nova senha do sistema"
            hint="Defina a nova senha que foi alterada no sistema externo"
          >
            <div className="relative">
              <input
                required
                type={mostrarSenha ? 'text' : 'password'}
                maxLength={500}
                placeholder="Digite a nova senha segura…"
                className={inputClass}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                disabled={salvando}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] font-semibold text-ink/60 hover:text-ink"
              >
                {mostrarSenha ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </Campo>

          <Campo label="Confirme a nova senha">
            <input required type="password" autoComplete="new-password" maxLength={500} className={inputClass}
              value={confirmacaoSenha} onChange={(e) => setConfirmacaoSenha(e.target.value)} disabled={salvando} />
          </Campo>

          <Campo label="Notas e orientações (opcional)">
            <textarea
              rows={2}
              maxLength={2000}
              placeholder="Informações adicionais sobre o novo login ou política…"
              className={inputClass}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={salvando}
            />
          </Campo>

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="secondary" onClick={aoFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || carregandoSegredo || !acessoId}>
              {salvando ? 'Aprovando e rotacionando…' : 'Revogar e trocar senha'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
