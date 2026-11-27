// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Textura } from '../components/Textura'
import { Aviso, Button, Campo, inputClass } from '../components/ui'
import { BACKEND } from '../lib/backend'
import { firebaseConfigured } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { PEDIR_LINK_CLIENTE, type UnidadeLoginCliente } from '../lib/supabaseAuth'
import { mensagemErro } from '../lib/errors'

function Moldura({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr_auto] bg-surface md:grid-cols-2 md:grid-rows-1">
      <header className="relative flex min-w-0 flex-col bg-graphite px-6 py-5 text-surface md:justify-between md:px-10 md:pb-12 md:pt-10 xl:px-16">
        <div className="flex flex-wrap items-center justify-between gap-3 md:block">
          <Logo claro />
          <span className="text-xs font-medium text-line-strong md:mt-8 md:block">Base da rede Ubox</span>
        </div>
        <div className="my-auto hidden max-w-xl py-12 md:block">
          <h1 className="text-4xl font-bold leading-tight xl:text-6xl">Tudo da sua unidade UBOX em um só lugar.</h1>
          <p className="mt-5 max-w-md text-base font-light leading-relaxed text-line-strong">
            Consulte manuais, acompanhe as rotinas da unidade e acesse os treinamentos da rede.
          </p>
        </div>
        <Textura className="absolute inset-x-0 bottom-0 max-md:hidden" />
      </header>
      <main className="flex min-w-0 items-start justify-center px-6 pt-8 pb-10 md:items-center md:px-10">
        <div className="w-full max-w-md space-y-1 wrap-anywhere">{children}</div>
      </main>
      <Textura className="md:hidden" />
    </div>
  )
}

export function ConfigPendentePage() {
  return (
    <Moldura>
      <h2 className="text-2xl font-bold">Configuração do Firebase pendente</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        O portal abre, mas ainda não fala com o Firebase. Preencha <code>src/firebaseConfig.ts</code> ou as variáveis{' '}
        <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>, <code>VITE_FIREBASE_PROJECT_ID</code>,{' '}
        <code>VITE_FIREBASE_STORAGE_BUCKET</code>, <code>VITE_FIREBASE_MESSAGING_SENDER_ID</code> e <code>VITE_FIREBASE_APP_ID</code>.
      </p>
    </Moldura>
  )
}

export function EntrarPage() {
  const { status, entrar, entrarCliente, user } = useAuth()
  const [cliente, setCliente] = useState(false)
  const [cpf, setCpf] = useState('')
  const [unidades, setUnidades] = useState<UnidadeLoginCliente[] | null>(null)
  const [unidadeId, setUnidadeId] = useState('')
  const [ajudaCliente, setAjudaCliente] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  if (status === 'ready') return <Navigate to={user?.papel === 'cliente' ? '/portal' : '/'} replace />
  if (status === 'pending' || status === 'rejected') return <Navigate to="/aguardando" replace />
  if (status === 'incomplete') return <Navigate to="/completar" replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setOcupado(true)
    setErro('')
    try {
      if (cliente) {
        const opcoes = await entrarCliente(cpf, senha, unidadeId || undefined)
        if (opcoes) setUnidades(opcoes)
      } else await entrar(email, senha)
    } catch (falha) {
      setErro(cliente ? 'CPF ou senha inválidos.' : mensagemErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  function trocarModo(modoCliente: boolean) {
    setCliente(modoCliente)
    setSenha('')
    setErro('')
    setUnidades(null)
    setUnidadeId('')
    setAjudaCliente(false)
  }

  return (
    <Moldura>
      <h2 className="text-2xl font-bold">Entrar</h2>
      {BACKEND === 'supabase' && <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Tipo de acesso">
        <Button type="button" variant={cliente ? 'secondary' : 'primary'} aria-pressed={!cliente} disabled={ocupado} onClick={() => trocarModo(false)}>Sou da equipe</Button>
        <Button type="button" variant={cliente ? 'primary' : 'secondary'} aria-pressed={cliente} disabled={ocupado} onClick={() => trocarModo(true)}>Sou cliente</Button>
      </div>}
      <p className="mt-2 text-sm text-muted">{cliente ? 'Entre com seu CPF e a senha que você definiu.' : 'Use o e-mail cadastrado na franqueadora.'}</p>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        {cliente ? <Campo label="CPF">
          <input className={inputClass} inputMode="numeric" autoComplete="username" maxLength={14} disabled={ocupado} required value={cpf}
            onChange={(e) => { setCpf(e.target.value); setUnidades(null); setUnidadeId('') }} />
        </Campo> : <Campo label="E-mail">
          <input className={inputClass} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>}
        {unidades && <Campo label="Unidade UBOX">
          <select className={inputClass} required value={unidadeId} disabled={ocupado} onChange={(e) => setUnidadeId(e.target.value)}>
            <option value="">Escolha sua unidade</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </Campo>}
        <Campo label="Senha">
          <input className={inputClass} type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Button type="submit" className="w-full" disabled={ocupado}>
          {ocupado ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      {cliente ? <>
        <Button type="button" variant="ghost" className="mt-3" onClick={() => setAjudaCliente(true)}>Esqueci a senha</Button>
        {ajudaCliente && <Aviso tom="info">{PEDIR_LINK_CLIENTE}</Aviso>}
      </> : <>
        <p className="mt-4 text-sm">
          <Link to="/recuperar" className="font-semibold text-brand">
            Esqueci a senha
          </Link>
        </p>
        <p className="mt-2 text-sm text-muted">
          Ainda não tem acesso?{' '}
          <Link to="/cadastro" className="font-semibold text-ink">
            Criar conta
          </Link>
        </p>
      </>}
    </Moldura>
  )
}

export function CadastroPage() {
  const { status, cadastrar } = useAuth()
  const [form, setForm] = useState({ nome: '', email: '', senha: '', unidade: '', cidade: '' })
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  if (status === 'ready') return <Navigate to="/" replace />
  if (status === 'pending' || status === 'rejected') return <Navigate to="/aguardando" replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setOcupado(true)
    setErro('')
    try {
      await cadastrar(form)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  const set = (campo: keyof typeof form) => (evento: { target: { value: string } }) => setForm({ ...form, [campo]: evento.target.value })

  return (
    <Moldura>
      <h2 className="text-2xl font-bold">Criar conta</h2>
      <p className="mt-1 text-sm text-muted">A franqueadora aprova o acesso antes da biblioteca abrir.</p>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        <Campo label="Nome completo">
          <input className={inputClass} required minLength={2} value={form.nome} onChange={set('nome')} />
        </Campo>
        <Campo label="E-mail">
          <input className={inputClass} type="email" required value={form.email} onChange={set('email')} />
        </Campo>
        <Campo label="Senha" hint="Mínimo de 6 caracteres.">
          <input className={inputClass} type="password" required minLength={6} value={form.senha} onChange={set('senha')} />
        </Campo>
        <Campo label="Unidade">
          <input className={inputClass} required placeholder="Uberaba" value={form.unidade} onChange={set('unidade')} />
        </Campo>
        <Campo label="Cidade">
          <input className={inputClass} required placeholder="Uberaba/MG" value={form.cidade} onChange={set('cidade')} />
        </Campo>
        <Button type="submit" className="w-full" disabled={ocupado}>
          {ocupado ? 'Enviando…' : 'Pedir acesso'}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        <Link to="/entrar" className="font-semibold text-brand">
          Já tenho conta
        </Link>
      </p>
    </Moldura>
  )
}

export function RecuperarPage() {
  const { recuperar, linkSenhaInvalido } = useAuth()
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState(
    linkSenhaInvalido ? 'Link inválido ou expirado. Peça outro em Esqueci a senha pelo formulário abaixo.' : '',
  )
  const [ok, setOk] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setOcupado(true)
    setErro('')
    try {
      await recuperar(email)
      setOk(true)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Moldura>
      <h2 className="text-2xl font-bold">Recuperar senha</h2>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {erro ? <div role="alert"><Aviso tom="erro">{erro}</Aviso></div> : null}
        {ok ? <Aviso tom="ok">Enviamos o link de redefinição para o seu e-mail.</Aviso> : null}
        <Campo label="E-mail">
          <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Button type="submit" className="w-full" disabled={ocupado}>
          Enviar link
        </Button>
      </form>
      <p className="mt-4 text-sm">
        <Link to="/entrar" className="font-semibold text-brand">
          Voltar ao login
        </Link>
      </p>
    </Moldura>
  )
}

/** Supabase: tela aberta pelo link de redefinição (também o "primeiro acesso" de quem veio do Firebase). */
export function NovaSenhaPage() {
  const { definirSenha } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (senha !== confirma) {
      setErro('As senhas não conferem.')
      return
    }
    setOcupado(true)
    setErro('')
    try {
      await definirSenha(senha)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Moldura>
      <h2 className="text-2xl font-bold">Criar sua senha</h2>
      <p className="mt-2 text-sm text-muted">Escolha a senha que você vai usar para entrar no portal.</p>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        <Campo label="Nova senha">
          <input className={inputClass} type="password" required minLength={6} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Campo label="Repita a senha">
          <input className={inputClass} type="password" required minLength={6} autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        </Campo>
        <Button type="submit" className="w-full" disabled={ocupado}>
          Salvar senha
        </Button>
      </form>
    </Moldura>
  )
}

export function AguardandoPage() {
  const { status, user, sair } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (status === 'ready') navigate(user?.papel === 'cliente' ? '/portal' : '/')
    if (status === 'signedOut') navigate('/entrar')
  }, [status, navigate, user?.papel])
  const recusado = status === 'rejected' || user?.recusado
  return (
    <Moldura>
      <h2 className="text-2xl font-bold">{user?.papel === 'cliente' ? 'Acesso indisponível' : recusado ? 'Cadastro não aprovado' : 'Aguardando aprovação'}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {user?.papel === 'cliente' ? 'Fale com sua unidade UBOX para conferir o acesso.' : recusado
          ? 'A franqueadora não liberou este cadastro. Fale com o time Ubox se isso for um engano.'
          : `${user?.nome ?? 'Sua conta'} está na fila da franqueadora. Quando o acesso for liberado, a biblioteca abre neste mesmo login.`}
      </p>
      <Button className="mt-6" variant="secondary" onClick={() => void sair()}>
        Sair
      </Button>
    </Moldura>
  )
}

export function CompletarPage() {
  const { status, nomeSugerido, completarCadastro } = useAuth()
  const [form, setForm] = useState({ nome: nomeSugerido, unidade: '', cidade: '' })
  const [erro, setErro] = useState('')
  if (status === 'ready') return <Navigate to="/" replace />
  if (status === 'signedOut') return <Navigate to="/entrar" replace />
  if (status === 'pending' || status === 'rejected') return <Navigate to="/aguardando" replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    try {
      await completarCadastro(form)
    } catch (falha) {
      setErro(mensagemErro(falha))
    }
  }

  return (
    <Moldura>
      <h2 className="text-2xl font-bold">Concluir cadastro</h2>
      <p className="mt-1 text-sm text-muted">Sua conta existe, e o perfil da franquia ainda precisa ser gravado.</p>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        <Campo label="Nome">
          <input className={inputClass} required minLength={2} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </Campo>
        <Campo label="Unidade">
          <input className={inputClass} required value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
        </Campo>
        <Campo label="Cidade">
          <input className={inputClass} required value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
        </Campo>
        <Button type="submit" className="w-full">
          Salvar e aguardar aprovação
        </Button>
      </form>
    </Moldura>
  )
}

export function portaConfigurada(): boolean {
  return BACKEND === 'supabase' || firebaseConfigured
}
