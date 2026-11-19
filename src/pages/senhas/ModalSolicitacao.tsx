import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFocusTrap } from '../../lib/focusTrap'
import { Aviso, Button, Campo, inputClass } from '../../components/ui'
import { TIPOS_SOLICITACAO, type TipoSolicitacaoAcesso } from '../../data/senhas'
import { criarSolicitacaoAcesso, type Acesso } from '../../lib/senhas'
import type { Usuario } from '../../types'
import { mensagemErro } from '../../lib/errors'

interface ModalSolicitacaoProps {
  aberto: boolean
  aoFechar: () => void
  usuario: Usuario
  unidadeId: string
  unidadeNome: string
  acessos: Acesso[]
  membrosEquipe: { uid: string; nome: string }[]
  aoSalvar: () => void
  acessoPreSelecionado?: Acesso | null
  tipoInicial?: TipoSolicitacaoAcesso
}

export function ModalSolicitacao({
  aberto,
  aoFechar,
  usuario,
  unidadeId,
  unidadeNome,
  acessos,
  membrosEquipe,
  aoSalvar,
  acessoPreSelecionado,
  tipoInicial = 'pedir_acesso',
}: ModalSolicitacaoProps) {
  const [tipo, setTipo] = useState<TipoSolicitacaoAcesso>(tipoInicial)
  const [acessoId, setAcessoId] = useState(acessoPreSelecionado?.id ?? '')
  const [nomeNovoSistema, setNomeNovoSistema] = useState('')
  const [alvoUid, setAlvoUid] = useState(usuario.uid)
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const selectTipoRef = useRef<HTMLSelectElement>(null)
  const armadilhaRef = useFocusTrap<HTMLDivElement>(aberto)

  // Só permite solicitar para acessos da unidade do usuário
  const acessosValidos = acessos.filter(
    (a) => a.escopo === 'unidade' && (!unidadeId || a.unidadeId === unidadeId),
  )

  useEffect(() => {
    if (aberto) {
      setTipo(tipoInicial)
      setAcessoId(acessoPreSelecionado?.id ?? (acessosValidos[0]?.id || ''))
      setNomeNovoSistema('')
      setAlvoUid(usuario.uid)
      setMotivo('')
      setErro('')
      setSalvando(false)
      setTimeout(() => selectTipoRef.current?.focus(), 50)
    }
  }, [aberto, tipoInicial, acessoPreSelecionado, usuario.uid])

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

  if (!aberto) return null

  const selecionado = acessosValidos.find((a) => a.id === acessoId)

  async function submeter(evento: FormEvent) {
    evento.preventDefault()
    setErro('')

    if (tipo !== 'novo_sistema' && !acessoId) {
      setErro('Selecione o sistema da sua unidade para esta solicitação.')
      return
    }

    if (tipo === 'novo_sistema' && !nomeNovoSistema.trim()) {
      setErro('Informe o nome do sistema solicitado.')
      return
    }

    if (!motivo.trim()) {
      setErro('Informe o motivo da solicitação.')
      return
    }

    let alvoNomeFinal = ''
    if (alvoUid === usuario.uid) {
      alvoNomeFinal = usuario.nome
    } else {
      const membro = membrosEquipe.find((m) => m.uid === alvoUid)
      alvoNomeFinal = membro?.nome ?? ''
    }

    setSalvando(true)
    try {
      await criarSolicitacaoAcesso(usuario, {
        tipo,
        acessoId: tipo === 'novo_sistema' ? '' : acessoId,
        acessoNome: tipo === 'novo_sistema' ? nomeNovoSistema.trim() : selecionado?.nome ?? '',
        unidadeId,
        unidadeNome,
        motivo: motivo.trim(),
        alvoUid: tipo === 'pedir_acesso' || tipo === 'revogar' ? alvoUid : '',
        alvoNome: tipo === 'pedir_acesso' || tipo === 'revogar' ? alvoNomeFinal : '',
      })
      aoSalvar()
      aoFechar()
    } catch (falha: unknown) {
      setErro(mensagemErro(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      ref={armadilhaRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-solicitacao"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand">Fluxo da Unidade</p>
            <h2 id="titulo-modal-solicitacao" className="mt-1 text-xl font-bold text-ink">
              Pedir acesso ou sistema
            </h2>
            <p className="mt-0.5 text-xs text-ink/60">
              Solicitação formal para aprovação do franqueado da unidade.
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

        <form onSubmit={submeter} className="mt-4 space-y-4">
          <Campo label="Tipo de solicitação">
            <select
              ref={selectTipoRef}
              className={inputClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoSolicitacaoAcesso)}
              disabled={salvando}
            >
              {TIPOS_SOLICITACAO.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </Campo>

          {tipo === 'novo_sistema' ? (
            <Campo
              label="Nome do sistema solicitado"
              hint="Ex.: Canva Pro da unidade, software de CRM local, etc."
            >
              <input
                required
                maxLength={120}
                placeholder="Ex.: Ferramenta de disparo de WhatsApp"
                className={inputClass}
                value={nomeNovoSistema}
                onChange={(e) => setNomeNovoSistema(e.target.value)}
                disabled={salvando}
              />
            </Campo>
          ) : (
            <Campo label="Sistema da unidade">
              <select
                className={inputClass}
                value={acessoId}
                onChange={(e) => setAcessoId(e.target.value)}
                disabled={salvando}
              >
                <option value="">Selecione um sistema da unidade…</option>
                {acessosValidos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome} ({a.unidadeNome || 'Unidade'})
                  </option>
                ))}
              </select>
            </Campo>
          )}

          {tipo === 'pedir_acesso' || tipo === 'revogar' ? (
            <Campo
              label={tipo === 'revogar' ? 'Colaborador a revogar acesso' : 'Para quem é o acesso'}
              hint={
                tipo === 'revogar'
                  ? 'A aprovação da revogação encerra o acesso (inclusive se a senha era visível para toda a equipe) e exige a troca da senha no mesmo passo.'
                  : undefined
              }
            >
              <select
                className={inputClass}
                value={alvoUid}
                onChange={(e) => setAlvoUid(e.target.value)}
                disabled={salvando}
              >
                <option value={usuario.uid}>{usuario.nome} (Você)</option>
                {membrosEquipe
                  .filter((m) => m.uid !== usuario.uid)
                  .map((m) => (
                    <option key={m.uid} value={m.uid}>
                      {m.nome}
                    </option>
                  ))}
              </select>
            </Campo>
          ) : null}

          <Campo label="Justificativa / Motivo">
            <textarea
              required
              rows={3}
              maxLength={2000}
              placeholder="Descreva por que esse acesso ou alteração é necessária na operação da unidade…"
              className={inputClass}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={salvando}
            />
          </Campo>

          {tipo === 'revogar' ? (
            <div className="rounded-2xl border border-brand/30 bg-brand/10 p-3 text-xs text-ink leading-relaxed">
              <p className="font-bold text-brand-dark">Regra de segurança da Rede Ubox:</p>
              <p className="mt-0.5 text-ink/80">
                A aprovação da revogação encerra o acesso (inclusive se a senha era visível para toda a equipe) e troca a senha no mesmo passo para garantir a proteção imediata do cofre.
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="secondary" onClick={aoFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Enviando…' : 'Enviar solicitação'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
