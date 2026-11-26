import { useState } from 'react'
import { Aviso, Button, Campo, inputClass } from '../components/ui'
import { atualizarMeuNome } from '../lib/api'
import { useVisao } from '../lib/visao'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/errors'
import type { Papel } from '../types'

function rotuloPapel(papel: Papel): string {
  if (papel === 'admin') return 'Admin da franqueadora'
  if (papel === 'equipe_franqueadora') return 'Equipe da franqueadora'
  if (papel === 'franqueado') return 'Franqueado'
  return 'Equipe do franqueado'
}

export function PerfilPage() {
  const { user, refresh, recuperar } = useAuth()
  const [nome, setNome] = useState(user?.nome ?? '')
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const { comoFranqueado, simulado } = useVisao()
  if (!user) return null
  if (comoFranqueado) {
    if (!simulado) return <Aviso>Escolha o franqueado para consultar o perfil.</Aviso>
    return (
      <section className="mx-auto max-w-lg space-y-4">
        <h1 className="text-3xl font-extrabold">Perfil do franqueado</h1>
        <div className="space-y-2 rounded-2xl border border-line bg-white p-5">
          <h2 className="text-xl font-bold">{simulado.nome}</h2>
          <p>Unidade: {simulado.unidade || 'Sem unidade informada'}</p>
          <p>Cidade: {simulado.cidade || 'Sem cidade informada'}</p>
          <p>{rotuloPapel(simulado.papel)}</p>
        </div>
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-3xl font-extrabold">Meu perfil</h1>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {mensagem ? <Aviso tom="ok">{mensagem}</Aviso> : null}
      <form
        className="space-y-4 rounded-2xl border border-line bg-white p-5"
        onSubmit={async (evento) => {
          evento.preventDefault()
          setErro('')
          try {
            await atualizarMeuNome(user.uid, nome)
            await refresh()
            setMensagem('Nome atualizado.')
          } catch (falha) {
            setErro(mensagemErro(falha))
          }
        }}
      >
        <Campo label="Nome">
          <input className={inputClass} value={nome} minLength={2} required onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo label="E-mail">
          <input className={inputClass} value={user.email} disabled />
        </Campo>
        <Campo label="Unidade" hint="A franqueadora atualiza unidade e cidade.">
          <input className={inputClass} value={user.unidade} disabled />
        </Campo>
        <Campo label="Cidade">
          <input className={inputClass} value={user.cidade} disabled />
        </Campo>
        <p className="text-sm text-ink/60">Papel: {rotuloPapel(user.papel)}</p>
        <Button type="submit">Salvar nome</Button>
      </form>
      <Button
        variant="secondary"
        onClick={() => {
          void recuperar(user.email)
            .then(() => setMensagem('Enviamos o e-mail para redefinir a senha.'))
            .catch((falha: unknown) => setErro(mensagemErro(falha)))
        }}
      >
        Redefinir senha
      </Button>
    </div>
  )
}
