import { useEffect, useState } from 'react'
import { Aviso, Button, inputClass } from '../../components/ui'
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

  async function carregar() {
    setUsuarios(await listarUsuarios())
  }
  useEffect(() => {
    void carregar().catch((falha: unknown) => setErro(mensagemErro(falha)))
  }, [])

  async function salvar(alvo: Usuario, patch: Partial<Usuario>) {
    setErro('')
    setOk('')
    try {
      await atualizarUsuario(alvo.uid, patch)
      if ('ativo' in patch || 'papel' in patch || 'unidade' in patch || 'recusado' in patch) await reidratarAcessos()
      await carregar()
      setOk('Usuário atualizado e permissões recalculadas.')
    } catch (falha) {
      setErro(mensagemErro(falha))
    }
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
          onClick={() => {
            void reidratarAcessos()
              .then(() => setOk('Permissões atualizadas.'))
              .catch((falha: unknown) => setErro(mensagemErro(falha)))
          }}
        >
          Atualizar permissões
        </Button>
      </div>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
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
          <tbody>
            {usuarios.map((usuario) => (
              <tr key={usuario.uid} className="border-t border-line align-top">
                <td className="px-3 py-3">
                  <p className="font-medium">{usuario.nome}</p>
                  <p className="text-xs text-ink/50">{usuario.email}</p>
                  <p className="text-xs text-ink/50">{usuario.cidade}</p>
                </td>
                <td className="px-3 py-3">
                  <input
                    className={inputClass}
                    defaultValue={usuario.unidade}
                    onBlur={(evento) => {
                      if (evento.target.value !== usuario.unidade) void salvar(usuario, { unidade: evento.target.value })
                    }}
                  />
                </td>
                <td className="px-3 py-3">{rotuloPapel(usuario.papel)}</td>
                <td className="px-3 py-3">{usuario.recusado ? 'Recusado' : usuario.ativo ? 'Ativo' : 'Pendente'}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {!usuario.ativo && !usuario.recusado ? (
                      <Button onClick={() => void salvar(usuario, { ativo: true, recusado: false, modulosLiberados: usuario.modulosLiberados ?? [] })}>Aprovar</Button>
                    ) : null}
                    {usuario.ativo ? (
                      <Button variant="secondary" onClick={() => void salvar(usuario, { ativo: false })}>
                        Desativar
                      </Button>
                    ) : null}
                    {!usuario.recusado ? (
                      <Button variant="danger" onClick={() => void salvar(usuario, { recusado: true, ativo: false })}>
                        Recusar
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => void salvar(usuario, { recusado: false })}>
                        Reabrir
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
