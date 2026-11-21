import { useEffect, useRef, useState } from 'react'
import { Aviso, Button, Carregando, Vazio, inputClass } from '../../components/ui'
import { atualizarUsuario, listarUsuarios, reidratarAcessos } from '../../lib/api'
import { mensagemErro } from '../../lib/errors'
import type { Papel, Usuario } from '../../types'

function rotuloPapel(papel: Papel): string {
  if (papel === 'admin') return 'Admin da franqueadora'
  if (papel === 'equipe_franqueadora') return 'Equipe da franqueadora'
  if (papel === 'franqueado') return 'Franqueado'
  return 'Equipe do franqueado'
}

export function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [tique, setTique] = useState(0)
  const [gravando, setGravando] = useState(false)
  const gravacaoEmCurso = useRef(false)

  function recarregar() {
    setCarregando(true)
    setErroCarga('')
    setTique((t) => t + 1)
  }

  useEffect(() => {
    let ativo = true
    void listarUsuarios()
      .then((lista) => ativo && setUsuarios(lista))
      .catch((falha: unknown) => ativo && setErroCarga(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => { ativo = false }
  }, [tique])

  async function gravar(acao: () => Promise<void>) {
    if (gravacaoEmCurso.current || carregando) return
    gravacaoEmCurso.current = true
    setGravando(true)
    setErro('')
    setOk('')
    try {
      await acao()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      gravacaoEmCurso.current = false
      setGravando(false)
    }
  }

  function salvar(alvo: Usuario, patch: Partial<Usuario>) {
    if (gravacaoEmCurso.current) return
    if (patch.recusado === true && !window.confirm(`Recusar o acesso de ${alvo.nome}?`)) return
    if (patch.recusado !== true && patch.ativo === false && !window.confirm(`Desativar o acesso de ${alvo.nome}?`)) return
    void gravar(async () => {
      await atualizarUsuario(alvo.uid, patch)
      try {
        if ('ativo' in patch || 'papel' in patch || 'unidade' in patch || 'recusado' in patch) await reidratarAcessos()
        setOk('Usuário atualizado e permissões recalculadas.')
      } catch {
        setErro('O usuário foi atualizado, mas houve falha ao recalcular as permissões. Use “Atualizar permissões” para tentar novamente.')
      } finally {
        recarregar()
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Usuários</h1>
          <p className="text-sm text-ink/60">Unidades novas nascem em Gestão da Franqueadora. Esta lista aprova cadastros antigos e mostra a situação da conta.</p>
        </div>
        <Button
          variant="secondary"
          disabled={gravando || carregando}
          onClick={() => void gravar(async () => {
            await reidratarAcessos()
            setOk('Permissões atualizadas.')
            recarregar()
          })}
        >
          Atualizar permissões
        </Button>
      </div>
      {erro ? <Aviso tom="erro"><span role="alert">{erro}</span></Aviso> : null}
      {erroCarga ? <Aviso tom="erro"><span role="alert">{erroCarga}</span> <Button variant="ghost" onClick={recarregar}>Tentar novamente</Button></Aviso> : null}
      {carregando ? <Carregando texto="Carregando usuários…" /> : null}
      {gravando ? <Carregando texto="Gravando alteração…" /> : null}
      {!carregando && !erroCarga && !usuarios.length ? <Vazio titulo="Nenhum usuário cadastrado" texto="Os acessos aparecem aqui após o cadastro." /> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      {!carregando && !erroCarga && usuarios.length > 0 ? <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase tracking-wide text-ink/50">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Unidade</th>
              <th className="px-3 py-2">Papel</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody aria-busy={gravando}>
            {usuarios.map((usuario) => (
              <tr key={usuario.uid} className="border-t border-line align-top">
                <td className="px-3 py-3">
                  <p className="font-medium">{usuario.nome}</p>
                  <p className="text-xs text-ink/50">{usuario.email}</p>
                  <p className="text-xs text-ink/50">{usuario.cidade}</p>
                </td>
                <td className="px-3 py-3">
                  <form className="flex items-center gap-2" onSubmit={(evento) => {
                    evento.preventDefault()
                    const unidade = String(new FormData(evento.currentTarget).get('unidade') ?? '')
                    if (unidade !== usuario.unidade) salvar(usuario, { unidade })
                  }}>
                    <input
                      className={inputClass}
                      name="unidade"
                      aria-label={`Unidade de ${usuario.nome}`}
                      disabled={gravando}
                      defaultValue={usuario.unidade}
                    />
                    <Button type="submit" variant="ghost" disabled={gravando}>Salvar</Button>
                  </form>
                </td>
                <td className="px-3 py-3">{rotuloPapel(usuario.papel)}</td>
                <td className="px-3 py-3">{usuario.recusado ? 'Recusado' : usuario.ativo ? 'Ativo' : 'Pendente'}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {!usuario.ativo && !usuario.recusado ? (
                      <Button disabled={gravando} onClick={() => salvar(usuario, { ativo: true, recusado: false, modulosLiberados: usuario.modulosLiberados ?? [] })}>Aprovar</Button>
                    ) : null}
                    {usuario.ativo ? (
                      <Button variant="secondary" disabled={gravando} onClick={() => salvar(usuario, { ativo: false })}>
                        Desativar
                      </Button>
                    ) : null}
                    {!usuario.recusado ? (
                      <Button variant="danger" disabled={gravando} onClick={() => salvar(usuario, { recusado: true, ativo: false })}>
                        Recusar
                      </Button>
                    ) : (
                      <Button variant="secondary" disabled={gravando} onClick={() => salvar(usuario, { recusado: false })}>
                        Reabrir
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div> : null}
    </div>
  )
}
