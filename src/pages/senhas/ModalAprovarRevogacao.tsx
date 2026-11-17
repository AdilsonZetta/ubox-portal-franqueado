import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Aviso, Button, Campo, inputClass } from '../../components/ui'
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

  const senhaInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!aberto || !solicitacao || !acesso) {
      setLogin('')
      setNovaSenha('')
      setNotas('')
      setErro('')
      setSalvando(false)
      return
    }

    let ativo = true
    setCarregandoSegredo(true)
    setErro('')

    buscarSegredo(acesso.id)
      .then((seg) => {
        if (!ativo) return
        setLogin(seg.login)
        setNotas(seg.notas)
      })
      .catch(() => {
        // Se não conseguir ler segredo anterior, prossegue com campos em branco
      })
      .finally(() => {
        if (ativo) {
          setCarregandoSegredo(false)
          setTimeout(() => senhaInputRef.current?.focus(), 50)
        }
      })

    return () => {
      ativo = false
    }
  }, [aberto, solicitacao, acesso])

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
    if (!novaSenha.trim()) {
      setErro('A nova senha é obrigatória.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await aoConfirmar(novaSenha.trim(), login.trim(), notas.trim())
      aoFechar()
    } catch (falha: unknown) {
      setErro(falha instanceof Error ? falha.message : 'Falha ao aprovar revogação.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-revogacao"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-3xl border border-line bg-white p-6 shadow-xl">
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
            A aprovação encerra imediatamente o acesso de{' '}
            <span className="font-semibold">{solicitacao.alvoNome || 'colaborador'}</span> (inclusive se a senha era visível para toda a equipe) e troca a senha no cofre no mesmo passo para que credenciais antigas não continuem ativas.
          </p>
        </div>

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
                ref={senhaInputRef}
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
            <Button type="submit" disabled={salvando || !novaSenha.trim()}>
              {salvando ? 'Aprovando e rotacionando…' : 'Revogar e trocar senha'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
