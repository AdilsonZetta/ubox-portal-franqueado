import { useCallback, useEffect, useRef, useState } from 'react'
import { Aviso, Button, Campo, Carregando, Vazio, inputClass } from '../components/ui'
import { SLUGS_FRANQUEADO, MODULOS, subconjunto } from '../data/modulos'
import { atualizarModulosDoUsuario, atualizarUnidade, criarUnidade, criarUsuarioEquipe, enviarEmailRedefinicao, listarEquipeDaUnidade, listarUnidades } from '../lib/gestao'
import { listarUsuarios } from '../lib/api'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/errors'
import type { Unidade } from '../types'

function useListaAcessos<T>(consultar: () => Promise<T[]>) {
  const [lista, setLista] = useState<T[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const [gravando, setGravando] = useState(false)
  const operacaoEmCurso = useRef(false)

  function recarregar() {
    setCarregando(true)
    setErroCarga('')
    setTique((t) => t + 1)
  }

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErroCarga('')
    void consultar()
      .then((dados) => ativo && setLista(dados))
      .catch((falha: unknown) => ativo && setErroCarga(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => { ativo = false }
  }, [consultar, tique])

  async function gravar(acao: () => Promise<unknown>) {
    if (operacaoEmCurso.current || carregando || erroCarga) return
    operacaoEmCurso.current = true
    setGravando(true)
    setErro('')
    try {
      await acao()
      recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      operacaoEmCurso.current = false
      setGravando(false)
    }
  }

  return { lista, carregando, erroCarga, erro, setErro, recarregar, gravar, gravando, bloqueado: gravando || carregando || Boolean(erroCarga) }
}

function EstadoListaAcessos({ carregando, erroCarga, recarregar, vazio, equipe = false }: {
  carregando: boolean
  erroCarga: string
  recarregar: () => void
  vazio: boolean
  equipe?: boolean
}) {
  if (carregando) return <Carregando texto={equipe ? 'Carregando a equipe…' : 'Carregando unidades…'} />
  if (erroCarga) return <Aviso tom="erro"><span role="alert">{erroCarga}</span> <Button variant="ghost" onClick={recarregar}>Tentar novamente</Button></Aviso>
  if (!vazio) return null
  return <Vazio titulo={equipe ? 'Nenhuma pessoa na equipe' : 'Nenhuma unidade cadastrada'} texto="Use o formulário para fazer o primeiro cadastro." />
}

async function listarEquipeFranqueadora() {
  const lista = await listarUsuarios()
  return lista.filter((pessoa) => pessoa.papel === 'equipe_franqueadora')
}

function Checks({ valor, teto, onChange, disabled }: { valor: string[]; teto: string[]; disabled?: boolean; onChange: (slugs: string[]) => void }) {
  const opcoes = MODULOS.filter((modulo) => teto.includes(modulo.slug))
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {opcoes.map((modulo) => (
        <label key={modulo.slug} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
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
  const enviando = useRef(false)
  const [ocupado, setOcupado] = useState(false)
  return (
    <Aviso tom="ok">
      <p>
        Login criado para <strong>{email}</strong>. Senha provisória, mostrada só agora: <strong>{senha}</strong>
      </p>
      <Button
        type="button"
        variant="ghost"
        disabled={ocupado}
        onClick={() => {
          if (enviando.current) return
          enviando.current = true
          setOcupado(true)
          setAviso('')
          void enviarEmailRedefinicao(email)
            .then(() => setAviso('E-mail de redefinição enviado.'))
            .catch((falha: unknown) => setAviso(mensagemErro(falha)))
            .finally(() => {
              enviando.current = false
              setOcupado(false)
             })
        }}
      >
        {ocupado ? 'Enviando…' : 'Enviar e-mail de redefinição de senha'}
      </Button>
      {aviso ? <p role="status" className="mt-1">{aviso}</p> : null}
    </Aviso>
  )
}

export function FranqueadoraPage() {
  const { user } = useAuth()
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null)
  const [form, setForm] = useState({ nome: '', cidade: '', responsavel: '', email: '', modulos: ['manuais', 'universidade'] })
  const [editando, setEditando] = useState<Unidade | null>(null)

  const estado = useListaAcessos(listarUnidades)
  const { lista: unidades, erro, gravar, gravando, bloqueado } = estado

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="cabecalho-pagina">
        <p className="text-sm font-medium text-muted">Gestão da Franqueadora</p>
        <h1 className="text-2xl font-bold">Unidades franqueadas</h1>
        <p className="text-sm text-muted">Cadastre a unidade, o responsável e os módulos que ela pode ver.</p>
      </header>
      {erro ? <Aviso tom="erro"><span role="alert">{erro}</span></Aviso> : null}
      {criada ? <SenhaCriada email={criada.email} senha={criada.senha} /> : null}
      <form
        className="space-y-3 rounded-2xl border border-line bg-surface p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (bloqueado || !user) return
          void gravar(async () => {
            if (editando) {
              await atualizarUnidade(editando, { nome: form.nome, cidade: form.cidade, responsavel: form.responsavel, modulosLiberados: form.modulos, ativo: editando.ativo })
            } else {
              const resultado = await criarUnidade({ nome: form.nome, cidade: form.cidade, responsavel: form.responsavel, email: form.email, modulosLiberados: form.modulos, criadoPor: user.uid })
              setCriada({ email: form.email, senha: resultado.senha })
            }
            setEditando(null)
            setForm({ nome: '', cidade: '', responsavel: '', email: '', modulos: ['manuais', 'universidade'] })
          })
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
          <Button type="submit" disabled={bloqueado}>{gravando ? 'Gravando…' : editando ? 'Salvar unidade' : 'Criar franqueado'}</Button>
          {editando ? <Button type="button" variant="secondary" onClick={() => { setEditando(null); setForm({ nome: '', cidade: '', responsavel: '', email: '', modulos: ['manuais', 'universidade'] }) }}>Cancelar</Button> : null}
        </div>
      </form>
      <EstadoListaAcessos {...estado} vazio={!unidades.length} />
      <ul className="space-y-2">
        {!estado.carregando && !estado.erroCarga && unidades.map((unidade) => (
          <li key={unidade.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
            <span>
              <span className="block font-semibold">{unidade.nome}</span>
              <span className="text-xs text-muted">{unidade.responsavel} · {unidade.email} · {unidade.cidade} · {unidade.ativo ? 'Ativa' : 'Inativa'}</span>
            </span>
            <span className="flex gap-2">
              <Button variant="secondary" disabled={bloqueado} onClick={() => { setEditando(unidade); setCriada(null); setForm({ nome: unidade.nome, cidade: unidade.cidade, responsavel: unidade.responsavel, email: unidade.email, modulos: unidade.modulosLiberados }) }}>Editar</Button>
              <Button variant={unidade.ativo ? 'danger' : 'primary'} disabled={bloqueado || editando?.id === unidade.id} onClick={() => {
                if (unidade.ativo && !window.confirm(`Desativar a unidade ${unidade.nome}?`)) return
                void gravar(() => atualizarUnidade(unidade, { nome: unidade.nome, cidade: unidade.cidade, responsavel: unidade.responsavel, modulosLiberados: unidade.modulosLiberados, ativo: !unidade.ativo }))
              }}>
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
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null)
  const [form, setForm] = useState({ nome: '', email: '', modulos: ['manuais'] as string[] })

  const estado = useListaAcessos(listarEquipeFranqueadora)
  const { lista: equipe, erro, gravar, gravando, bloqueado } = estado

  const teto = [...SLUGS_FRANQUEADO, ...MODULOS.filter((modulo) => modulo.audiencia === 'franqueadora' && modulo.slug !== 'gestao-franqueadora' && modulo.slug !== 'gestao-usuarios').map((modulo) => modulo.slug)]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="cabecalho-pagina">
        <p className="text-sm font-medium text-muted">Gestão de Usuários</p>
        <h1 className="text-2xl font-bold">Equipe da franqueadora</h1>
        <p className="text-sm text-muted">Cada pessoa vê só os módulos marcados. Gestão da Franqueadora e esta tela ficam só com o admin.</p>
      </header>
      {erro ? <Aviso tom="erro"><span role="alert">{erro}</span></Aviso> : null}
      {criada ? <SenhaCriada email={criada.email} senha={criada.senha} /> : null}
      <form
        className="space-y-3 rounded-2xl border border-line bg-surface p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (bloqueado || !user) return
          void gravar(async () => {
            const senha = await criarUsuarioEquipe({
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
            setCriada({ email: form.email, senha })
            setForm({ nome: '', email: '', modulos: ['manuais'] })
          })
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label="Nome"><input className={inputClass} required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo label="E-mail de login"><input className={inputClass} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
        </div>
        <Checks valor={form.modulos} teto={teto} onChange={(modulos) => setForm({ ...form, modulos })} />
        <Button type="submit" disabled={bloqueado}>{gravando ? 'Gravando…' : 'Criar usuário da equipe'}</Button>
      </form>
      <EstadoListaAcessos {...estado} vazio={!equipe.length} equipe />
      <ul className="space-y-2">
        {!estado.carregando && !estado.erroCarga && equipe.map((pessoa) => (
          <li key={pessoa.uid} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-semibold">{pessoa.nome}</span>
                <span className="block text-xs text-muted">{pessoa.email} · {pessoa.ativo ? 'Ativo' : 'Inativo'}</span>
              </span>
              <Button variant="secondary" disabled={bloqueado} onClick={() => {
                if (pessoa.ativo && !window.confirm(`Desativar o acesso de ${pessoa.nome}?`)) return
                void gravar(() => atualizarModulosDoUsuario(pessoa.uid, { ativo: !pessoa.ativo }))
              }}>
                {pessoa.ativo ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
            <div className="mt-3">
              <Checks valor={pessoa.modulosLiberados ?? []} teto={teto} disabled={bloqueado} onChange={(modulos) => void gravar(() => atualizarModulosDoUsuario(pessoa.uid, { modulosLiberados: modulos }))} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MinhaEquipePage() {
  const { user } = useAuth()
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null)
  const [form, setForm] = useState({ nome: '', email: '', modulos: [] as string[] })
  const teto = user?.modulosLiberados ?? []

  const unidadeId = user?.unidadeId
  const consultarEquipe = useCallback(() => unidadeId ? listarEquipeDaUnidade(unidadeId) : Promise.resolve([]), [unidadeId])
  const estado = useListaAcessos(consultarEquipe)
  const { lista: equipe, erro, gravar, gravando, bloqueado, setErro } = estado

  if (!user || user.papel !== 'franqueado') return <Aviso tom="erro">Só o franqueado da unidade cria a equipe.</Aviso>

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="cabecalho-pagina">
        <h1 className="text-2xl font-bold">Minha equipe</h1>
        <p className="text-sm text-muted">Cada pessoa acessa só módulos que a unidade já tem. Unidade: {user.unidade || 'não vinculada'}.</p>
      </header>
      {!user.unidadeId ? <Aviso tom="erro">Esta conta ainda não está ligada a uma unidade criada pela franqueadora.</Aviso> : null}
      {user.modulosLiberados === undefined ? <Aviso>A franqueadora ainda precisa gravar os módulos desta unidade antes da equipe ser criada.</Aviso> : null}
      {erro ? <Aviso tom="erro"><span role="alert">{erro}</span></Aviso> : null}
      {criada ? <SenhaCriada email={criada.email} senha={criada.senha} /> : null}
      <form
        className="space-y-3 rounded-2xl border border-line bg-surface p-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          if (bloqueado || !user.unidadeId) return
          if (!subconjunto(form.modulos, teto)) {
            setErro('A equipe não pode receber um módulo que a unidade não tem.')
            return
          }
          void gravar(async () => {
            const senha = await criarUsuarioEquipe({
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
            setCriada({ email: form.email, senha })
            setForm({ nome: '', email: '', modulos: [] })
          })
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Campo label="Nome"><input className={inputClass} required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo label="E-mail de login"><input className={inputClass} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
        </div>
        <Checks valor={form.modulos} teto={teto} onChange={(modulos) => setForm({ ...form, modulos })} />
        <Button type="submit" disabled={bloqueado || !user.unidadeId}>{gravando ? 'Gravando…' : 'Criar pessoa da equipe'}</Button>
      </form>
      {user.unidadeId ? <EstadoListaAcessos {...estado} vazio={!equipe.length} equipe /> : null}
      <ul className="space-y-2">
        {!estado.carregando && !estado.erroCarga && user.unidadeId && equipe.map((pessoa) => (
          <li key={pessoa.uid} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{pessoa.nome}<span className="block text-xs font-normal text-muted">{pessoa.email}</span></span>
              <Button variant="secondary" disabled={bloqueado} onClick={() => {
                if (pessoa.ativo && !window.confirm(`Desativar o acesso de ${pessoa.nome}?`)) return
                void gravar(() => atualizarModulosDoUsuario(pessoa.uid, { ativo: !pessoa.ativo, teto }))
              }}>
                {pessoa.ativo ? 'Desativar' : 'Ativar'}
              </Button>
            </div>
            <div className="mt-3">
              <Checks
                valor={pessoa.modulosLiberados ?? []}
                teto={teto}
                disabled={bloqueado}
                onChange={(modulos) => void gravar(() => atualizarModulosDoUsuario(pessoa.uid, { modulosLiberados: modulos, teto }))}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
