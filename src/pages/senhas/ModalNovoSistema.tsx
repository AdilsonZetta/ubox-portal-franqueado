import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFocusTrap } from '../../lib/focusTrap'
import { Aviso, Button, Campo, inputClass } from '../../components/ui'
import {
  CATEGORIAS_ACESSO,
  MAX_VISIVEL_PARA,
  type CategoriaAcesso,
  type EscopoAcesso,
} from '../../data/senhas'
import { criarAcesso, urlSistemaValida, type NovoAcessoDados } from '../../lib/senhas'
import type { Usuario } from '../../types'

interface ModalNovoSistemaProps {
  aberto: boolean
  aoFechar: () => void
  usuario: Usuario
  unidadeId: string
  unidadeNome: string
  ehAdminOuFranqueadora: boolean
  membrosEquipe: { uid: string; nome: string }[]
  aoSalvar: () => void
}

export function ModalNovoSistema({
  aberto,
  aoFechar,
  usuario,
  unidadeId,
  unidadeNome,
  ehAdminOuFranqueadora,
  membrosEquipe,
  aoSalvar,
}: ModalNovoSistemaProps) {
  const escopo: EscopoAcesso = ehAdminOuFranqueadora ? 'rede' : 'unidade'

  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState<CategoriaAcesso>('gestao')
  const [url, setUrl] = useState('')
  const [responsavelNome, setResponsavelNome] = useState(usuario.nome)
  const [visivelParaEquipe, setVisivelParaEquipe] = useState(false)
  const [visivelPara, setVisivelPara] = useState<string[]>([])
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [notas, setNotas] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const nomeInputRef = useRef<HTMLInputElement>(null)
  const armadilhaRef = useFocusTrap<HTMLDivElement>(aberto)

  useEffect(() => {
    if (aberto) {
      setNome('')
      setCategoria('gestao')
      setUrl('')
      setResponsavelNome(ehAdminOuFranqueadora ? 'Franqueadora' : usuario.nome)
      setVisivelParaEquipe(false)
      setVisivelPara([])
      setLogin('')
      setSenha('')
      setNotas('')
      setErro('')
      setSalvando(false)
      setTimeout(() => nomeInputRef.current?.focus(), 50)
    }
  }, [aberto, ehAdminOuFranqueadora, usuario.nome])

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

  function alternarMembro(uid: string) {
    setVisivelPara((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid)
      }
      if (prev.length >= MAX_VISIVEL_PARA) {
        return prev
      }
      return [...prev, uid]
    })
  }

  async function submeter(evento: FormEvent) {
    evento.preventDefault()
    if (salvando) return
    setErro('')

    if (!nome.trim()) {
      setErro('Informe o nome do sistema.')
      return
    }

    const urlTrim = url.trim()
    if (!urlSistemaValida(urlTrim)) {
      setErro('Informe uma URL HTTPS completa.')
      return
    }

    if (senha.trim().length === 0) {
      setErro('A senha é obrigatória.')
      return
    }

    setSalvando(true)
    try {
      const payload: NovoAcessoDados = {
        nome: nome.trim(),
        categoria,
        url: urlTrim,
        escopo,
        unidadeId: escopo === 'unidade' ? unidadeId : '',
        unidadeNome: escopo === 'unidade' ? unidadeNome : '',
        responsavelId: escopo === 'unidade' ? usuario.uid : null,
        responsavelNome: responsavelNome.trim() || (escopo === 'rede' ? 'Franqueadora' : 'Equipe da unidade'),
        visivelPara: escopo === 'unidade' ? (visivelParaEquipe ? [] : visivelPara.slice(0, MAX_VISIVEL_PARA)) : [],
        visivelParaEquipe: escopo === 'unidade' ? visivelParaEquipe : false,
        login: login.trim(),
        senha,
        notas: notas.trim(),
      }

      await criarAcesso(usuario, payload)
      aoSalvar()
      aoFechar()
    } catch {
      setErro('Não foi possível salvar o sistema no cofre. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      ref={armadilhaRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-novo-sistema"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand">
              {escopo === 'rede' ? 'Homologação da Rede' : 'Cofre da Unidade'}
            </p>
            <h2 id="titulo-novo-sistema" className="mt-1 text-xl font-bold text-ink">
              Novo sistema homologado
            </h2>
            <p className="mt-0.5 text-xs text-ink/60">
              {escopo === 'rede'
                ? 'Cadastre credenciais homologadas que serão compartilhadas com toda a rede.'
                : 'Cadastre os dados de acesso e defina as permissões no cofre da sua unidade.'}
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

        {escopo === 'rede' ? (
          <div className="mt-4 rounded-2xl border border-brand/30 bg-brand/10 p-3.5 text-xs text-ink leading-relaxed">
            <p className="font-bold text-brand-dark">Acesso compartilhado com a Rede:</p>
            <p className="mt-0.5 text-ink/80">
              Este sistema ficará acessível para todas as unidades franqueadas que possuem o módulo Central de Senhas liberado. O segredo é compartilhado por escopo da rede, sem seleção por usuário.
            </p>
          </div>
        ) : null}

        <form onSubmit={submeter} className="mt-4 space-y-4">
          <Campo label="Nome do sistema">
            <input
              ref={nomeInputRef}
              required
              minLength={2}
              maxLength={120}
              placeholder={escopo === 'rede' ? 'Ex.: Google Workspace Corporativo' : 'Ex.: Sistema de Gestão da Unidade'}
              className={inputClass}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={salvando}
            />
          </Campo>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Categoria">
              <select
                className={inputClass}
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaAcesso)}
                disabled={salvando}
              >
                {CATEGORIAS_ACESSO.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nome}
                  </option>
                ))}
              </select>
            </Campo>

            {escopo === 'unidade' ? (
              <Campo label="Responsável pelo sistema">
                <input
                  required
                  maxLength={120}
                  className={inputClass}
                  value={responsavelNome}
                  onChange={(e) => setResponsavelNome(e.target.value)}
                  disabled={salvando}
                />
              </Campo>
            ) : (
              <Campo label="Responsável institucional">
                <input
                  readOnly
                  className={`${inputClass} bg-paper text-ink/70`}
                  value="Franqueadora Ubox"
                />
              </Campo>
            )}
          </div>

          <Campo label="URL do sistema (opcional)" hint="Link oficial de acesso (deve começar com https://)">
            <input
              type="url"
              placeholder="https://sistema.exemplo.com.br"
              className={inputClass}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={salvando}
            />
          </Campo>

          <div className="rounded-2xl border border-line bg-paper/50 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ink/50">Credenciais no cofre</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Usuário / Login">
                <input
                  required
                  maxLength={200}
                  placeholder={escopo === 'rede' ? 'login.rede@ubox.com.br' : 'admin@unidade'}
                  className={inputClass}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  disabled={salvando}
                />
              </Campo>
              <Campo label="Senha">
                <input
                  required
                  type="password"
                  maxLength={500}
                  placeholder="••••••••••••"
                  className={inputClass}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={salvando}
                />
              </Campo>
            </div>
            <Campo label="Notas adicionais e orientações (opcional)">
              <textarea
                rows={2}
                maxLength={2000}
                placeholder="Ex.: Trocar token a cada 90 dias; login restrito ao IP da unidade."
                className={inputClass}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                disabled={salvando}
              />
            </Campo>
          </div>

          {escopo === 'unidade' ? (
            <div className="rounded-2xl border border-line bg-paper/50 p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-ink/50">Permissões de visualização</p>
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={visivelParaEquipe}
                  onChange={(e) => setVisivelParaEquipe(e.target.checked)}
                  disabled={salvando}
                  className="rounded text-brand focus:ring-brand"
                />
                <span className="font-medium">Liberar visualização para toda a equipe da unidade</span>
              </label>

              {!visivelParaEquipe && membrosEquipe.length > 0 ? (
                <div className="mt-2 space-y-1.5 border-t border-line/60 pt-2">
                  <span className="block text-xs text-ink/60">
                    Ou selecione pessoas específicas da equipe (máx. {MAX_VISIVEL_PARA}):
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {membrosEquipe.map((membro) => (
                      <label key={membro.uid} className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visivelPara.includes(membro.uid)}
                          onChange={() => alternarMembro(membro.uid)}
                          disabled={salvando}
                          className="rounded text-brand focus:ring-brand"
                        />
                        <span>{membro.nome}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button type="button" variant="secondary" onClick={aoFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar no cofre'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
