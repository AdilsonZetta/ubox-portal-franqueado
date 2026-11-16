import { useState, type FormEvent } from 'react'
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

  if (!aberto) return null

  const selecionado = acessos.find((a) => a.id === acessoId)

  async function submeter(evento: FormEvent) {
    evento.preventDefault()
    setErro('')

    if (tipo !== 'novo_sistema' && !acessoId) {
      setErro('Selecione o sistema para esta solicitação.')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink">Pedir acesso ou sistema</h2>
            <p className="mt-0.5 text-xs text-ink/60">
              Solicitação formal para aprovação do franqueado da unidade.
            </p>
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

        <form onSubmit={submeter} className="mt-5 space-y-4">
          <Campo label="Tipo de solicitação">
            <select
              className={inputClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoSolicitacaoAcesso)}
            >
              {TIPOS_SOLICITACAO.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </Campo>

          {tipo === 'novo_sistema' ? (
            <Campo label="Nome do sistema sugerido">
              <input
                required
                maxLength={120}
                placeholder="Ex.: Hub de Atendimento WhatsApp"
                className={inputClass}
                value={nomeNovoSistema}
                onChange={(e) => setNomeNovoSistema(e.target.value)}
              />
            </Campo>
          ) : (
            <Campo label="Sistema do cofre">
              <select
                className={inputClass}
                value={acessoId}
                onChange={(e) => setAcessoId(e.target.value)}
                required
              >
                <option value="">Selecione um sistema…</option>
                {acessos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome} ({a.escopo === 'rede' ? 'Rede' : a.unidadeNome || 'Unidade'})
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
                  ? 'Aviso: ao revogar por desligamento, a senha do sistema deverá ser trocada imediatamente.'
                  : undefined
              }
            >
              <select
                className={inputClass}
                value={alvoUid}
                onChange={(e) => setAlvoUid(e.target.value)}
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
            />
          </Campo>

          {tipo === 'revogar' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Regra de segurança da Rede Ubox:</p>
              <p className="mt-0.5">
                Quando alguém sai da equipe, a senha é trocada no mesmo dia e o acesso antigo é encerrado.
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
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
