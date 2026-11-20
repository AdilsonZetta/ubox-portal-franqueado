import { useEffect, useState } from 'react'
import { Aviso, Button, Campo, inputClass } from '../components/ui'
import { SLUGS_FRANQUEADO, MODULOS, subconjunto } from '../data/modulos'
import { atualizarModulosDoUsuario, atualizarUnidade, criarUnidade, criarUsuarioEquipe, enviarEmailRedefinicao, listarEquipeDaUnidade, listarUnidades } from '../lib/gestao'
import { listarUsuarios } from '../lib/api'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/errors'
import type { Unidade, Usuario } from '../types'

function Checks({ valor, teto, onChange }: { valor: string[]; teto: string[]; onChange: (slugs: string[]) => void }) {
  const opcoes = MODULOS.filter((modulo) => teto.includes(modulo.slug))
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {opcoes.map((modulo) => (
        <label key={modulo.slug} className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={valor.includes(modulo.slug)}
            onChange={(evento) => onChange(evento.target.checked ? [...valor, modulo.slug] : valor.filter((slug) => slug !== modulo.slug))}
          />
          {modulo.nome}
        </label>
      ))}
    </div>
  )
}

function SenhaCriada({ email, senha }: { email: string; senha: string }) {
  const [aviso, setAviso] = useState('')
  return (
    <Aviso tom="ok">
      <p>
        Login criado para <strong>{email}</strong>. Senha provisória, mostrada só agora: <strong>{senha}</strong>
      </p>
      <button
        type="button"
        className="mt-2 font-semibold text-brand"
        onClick={() => {
          void enviarEmailRedefinicao(email)
            .then(() => setAviso('E-mail de redefinição enviado.'))
            .catch((falha: unknown) => setAviso(mensagemErro(falha)))
        }}
      >
        Enviar e-mail de redefinição de senha
      </button>
      {aviso ? <p className="mt-1">{aviso}</p> : null}
    </Aviso>
  )
}

export function FranqueadoraPage() {
  const { user } = useAuth()
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [erro, setErro] = useState('')
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null)
  const [form, setForm] = useState({ nome: '', cidade: '', responsavel: '', email: '', modulos: ['manuais', 'universidade'] })
  const [editando, setEditando] = useState<Unidade | null>(null)

  async function carregar() {
    setUnidades(await listarUnidades())
  }
  useEffect(() => {
    void carregar().catch((falha: unknown) => setErro(mensagemErro(falha)))
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm font-medium text-ink/50">Gestão da Franqueadora</p>
        <h1 className="text-2xl font-extrabold">Unidades franqueadas</h1>
        <p className="text-sm text-ink/60">Cadastre a unidade, o responsável e os módulos que ela pode ver.</p>
      </header>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {criada ? <SenhaCriada email={criada.email} senha={criada.senha} /> : null}
      <form
        className="space-y-3 rounded-2xl border border-line bg-white p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (!user) return
          setErro('')
          const acao = editando
            ? atualizarUnidade(editando, { nome: form.nome, cidade: form.cidade, responsavel: form.responsavel, modulosLiberados: form.modulos, ativo: editando.ativo })
            : criarUnidade({ nome: form.nome, cidade: form.cidade, responsavel: form.responsavel, email: form.email, modulosLiberados: form.modulos, criadoPor: user.uid }).then((resultado) => {
                setCriada({ email: form.email, senha: resultado.senha })
              })
          void acao
            .then(async () => {
              setEditando(null)
              setForm({ nome: '', cidade: '', responsavel: '', email: '', modulos: ['manuais', 'universidade'] })
              await carregar()
            })
            .catch((falha: unknown) => setErro(mensagemErro(falha)))
        }}
      >
        <h2 className="font-bold">{editando ? `Editar ${editando.nome}` : 'Criar franqueado'}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label="Nome da unidade"><input className={inputClass} required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo label="Cidade"><input className={inputClass} required value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></Campo>
          <Campo label="Responsável"><input className={inputClass} required value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} /></Campo>
          <Campo label="E-mail de login"><input className={inputClass} type="email" required disabled={Boolean(editando)} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
        </div>
        <Checks valor={form.modulos} teto={SLUGS_FRANQUEADO} onChange={(modulos) => setForm({ ...form, modulos })} />
        <div className="flex gap-2">
          <Button type="submit">{editando ? 'Salvar unidade' : 'Criar franqueado'}</Button>
          {editando ? <Button type="button" variant="secondary" onClick={() => { setEditando(null); setForm({ nome: '', cidade: '', responsavel: '', email: '', modulos: ['manuais', 'universidade'] }) }}>Cancelar</Button> : null}
        </div>
      </form>
      <ul className="space-y-2">
        {unidades.map((unidade) => (
          <li key={unidade.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
            <span>
              <span className="block font-semibold">{unidade.nome}</span>
              <span className="text-xs text-ink/50">{unidade.responsavel} · {unidade.email} · {unidade.cidade} · {unidade.ativo ? 'Ativa' : 'Inativa'}</span>
            </span>
            <span className="flex gap-2">
              <Button variant="secondary" onClick={() => { setEditando(unidade); setCriada(null); setForm({ nome: unidade.nome, cidade: unidade.cidade, responsavel: unidade.responsavel, email: unidade.email, modulos: unidade.modulosLiberados }) }}>Editar</Button>
              <Button variant={unidade.ativo ? 'danger' : 'primary'} onClick={() => void atualizarUnidade(unidade, { nome: unidade.nome, cidade: unidade.cidade, responsavel: unidade.responsavel, modulosLiberados: unidade.modulosLiberados, ativo: !unidade.ativo }).then(carregar).catch((falha: unknown) => setErro(mensagemErro(falha)))}>
                {unidade.ativo ? 'Desativar' : 'Ativar'}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function GestaoUsuariosPage() {
  const { user } = useAuth()
  const [equipe, setEquipe] = useState<Usuario[]>([])
  const [erro, setErro] = useState('')
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null)
  const [form, setForm] = useState({ nome: '', email: '', modulos: ['manuais'] as string[] })

  async function carregar() {
    const lista = await listarUsuarios()
    setEquipe(lista.filter((pessoa) => pessoa.papel === 'equipe_franqueadora'))
  }
  useEffect(() => {
    void carregar().catch((falha: unknown) => setErro(mensagemErro(falha)))
  }, [])

  const teto = [...SLUGS_FRANQUEADO, ...MODULOS.filter((modulo) => modulo.audiencia === 'franqueadora' && modulo.slug !== 'gestao-franqueadora' && modulo.slug !== 'gestao-usuarios').map((modulo) => modulo.slug)]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm font-medium text-ink/50">Gestão de Usuários</p>
        <h1 className="text-2xl font-extrabold">Equipe da franqueadora</h1>
        <p className="text-sm text-ink/60">Cada pessoa vê só os módulos marcados. Gestão da Franqueadora e esta tela ficam só com o admin.</p>
      </header>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {criada ? <SenhaCriada email={criada.email} senha={criada.senha} /> : null}
      <form
        className="space-y-3 rounded-2xl border border-line bg-white p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (!user) return
          void criarUsuarioEquipe({
            nome: form.nome,
            email: form.email,
            papel: 'equipe_franqueadora',
            unidade: 'Franqueadora',
            cidade: '',
            unidadeId: null,
            modulosLiberados: form.modulos,
            ativo: true,
            criadoPor: user.uid,
          })
            .then(async (senha) => {
              setCriada({ email: form.email, senha })
              setForm({ nome: '', email: '', modulos: ['manuais'] })
              await carregar()
            })
            .catch((falha: unknown) => setErro(mensagemErro(falha)))
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label="Nome"><input className={inputClass} required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo label="E-mail de login"><input className={inputClass} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
        </div>
        <Checks valor={form.modulos} teto={teto} onChange={(modulos) => setForm({ ...form, modulos })} />
        <Button type="submit">Criar usuário da equipe</Button>
      </form>
      <ul className="space-y-2">
        {equipe.map((pessoa) => (
          <li key={pessoa.uid} className="rounded-2xl border border-line bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-semibold">{pessoa.nome}</span>
                <span className="block text-xs text-ink/50">{pessoa.email} · {pessoa.ativo ? 'Ativo' : 'Inativo'}</span>
              </span>
              <Button variant="secondary" onClick={() => void atualizarModulosDoUsuario(pessoa.uid, { ativo: !pessoa.ativo }).then(carregar).catch((falha: unknown) => setErro(mensagemErro(falha)))}>
                {pessoa.ativo ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
            <div className="mt-3">
              <Checks valor={pessoa.modulosLiberados ?? []} teto={teto} onChange={(modulos) => void atualizarModulosDoUsuario(pessoa.uid, { modulosLiberados: modulos }).then(carregar).catch((falha: unknown) => setErro(mensagemErro(falha)))} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MinhaEquipePage() {
  const { user } = useAuth()
  const [equipe, setEquipe] = useState<Usuario[]>([])
  const [erro, setErro] = useState('')
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null)
  const [form, setForm] = useState({ nome: '', email: '', modulos: [] as string[] })
  const teto = user?.modulosLiberados ?? []

  async function carregar() {
    if (!user?.unidadeId) return
    setEquipe(await listarEquipeDaUnidade(user.unidadeId))
  }
  useEffect(() => {
    void carregar().catch((falha: unknown) => setErro(mensagemErro(falha)))
  }, [user?.unidadeId])

  if (!user || user.papel !== 'franqueado') return <Aviso tom="erro">Só o franqueado da unidade cria a equipe.</Aviso>

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Minha equipe</h1>
        <p className="text-sm text-ink/60">Cada pessoa acessa só módulos que a unidade já tem. Unidade: {user.unidade || 'não vinculada'}.</p>
      </header>
      {!user.unidadeId ? <Aviso tom="erro">Esta conta ainda não está ligada a uma unidade criada pela franqueadora.</Aviso> : null}
      {user.modulosLiberados === undefined ? <Aviso>A franqueadora ainda precisa gravar os módulos desta unidade antes da equipe ser criada.</Aviso> : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {criada ? <SenhaCriada email={criada.email} senha={criada.senha} /> : null}
      <form
        className="space-y-3 rounded-2xl border border-line bg-white p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (!subconjunto(form.modulos, teto)) {
            setErro('A equipe não pode receber um módulo que a unidade não tem.')
            return
          }
          void criarUsuarioEquipe({
            nome: form.nome,
            email: form.email,
            papel: 'equipe_franqueado',
            unidade: user.unidade,
            cidade: user.cidade,
            unidadeId: user.unidadeId ?? null,
            modulosLiberados: form.modulos,
            ativo: true,
            criadoPor: user.uid,
          })
            .then(async (senha) => {
              setCriada({ email: form.email, senha })
              setForm({ nome: '', email: '', modulos: [] })
              await carregar()
            })
            .catch((falha: unknown) => setErro(mensagemErro(falha)))
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label="Nome"><input className={inputClass} required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo label="E-mail de login"><input className={inputClass} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
        </div>
        <Checks valor={form.modulos} teto={teto} onChange={(modulos) => setForm({ ...form, modulos })} />
        <Button type="submit" disabled={!user.unidadeId}>Criar pessoa da equipe</Button>
      </form>
      <ul className="space-y-2">
        {equipe.map((pessoa) => (
          <li key={pessoa.uid} className="rounded-2xl border border-line bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{pessoa.nome}<span className="block text-xs font-normal text-ink/50">{pessoa.email}</span></span>
              <Button variant="secondary" onClick={() => void atualizarModulosDoUsuario(pessoa.uid, { ativo: !pessoa.ativo, teto }).then(carregar).catch((falha: unknown) => setErro(mensagemErro(falha)))}>
                {pessoa.ativo ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
            <div className="mt-3">
              <Checks
                valor={pessoa.modulosLiberados ?? []}
                teto={teto}
                onChange={(modulos) => void atualizarModulosDoUsuario(pessoa.uid, { modulosLiberados: modulos, teto }).then(carregar).catch((falha: unknown) => setErro(mensagemErro(falha)))}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
