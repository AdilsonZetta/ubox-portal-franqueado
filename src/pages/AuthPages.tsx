import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { Aviso, Button, Campo, inputClass } from '../components/ui'
import { firebaseConfigured } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/errors'

function Moldura({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-brand" />
        <Logo claro />
        <div className="max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Ubox Self Storage</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight">O conhecimento da rede, no mesmo lugar.</h1>
          <p className="mt-4 text-white/75">
            POPs, manuais, políticas e trilhas da franquia. Feito para a operação das unidades, a partir de Uberaba/MG.
          </p>
        </div>
        <p className="text-sm text-white/50">Rua Felício Abrão Sobrinho, 633 · Cidade Jardim · atendimento@ubox.net.br</p>
      </section>
      <section className="flex items-center justify-center bg-paper px-4 py-10">
        <div className="rise w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </section>
    </div>
  )
}

export function ConfigPendentePage() {
  return (
    <Moldura>
      <h2 className="text-2xl font-extrabold">Configuração do Firebase pendente</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink/70">
        O portal abre, mas ainda não fala com o Firebase. Preencha <code>src/firebaseConfig.ts</code> ou as variáveis{' '}
        <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>, <code>VITE_FIREBASE_PROJECT_ID</code>,{' '}
        <code>VITE_FIREBASE_STORAGE_BUCKET</code>, <code>VITE_FIREBASE_MESSAGING_SENDER_ID</code> e <code>VITE_FIREBASE_APP_ID</code>.
      </p>
    </Moldura>
  )
}

export function EntrarPage() {
  const { status, entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  if (status === 'ready') return <Navigate to="/" replace />
  if (status === 'pending' || status === 'rejected') return <Navigate to="/aguardando" replace />
  if (status === 'incomplete') return <Navigate to="/completar" replace />

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setOcupado(true)
    setErro('')
    try {
      await entrar(email, senha)
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Moldura>
      <h2 className="text-2xl font-extrabold">Entrar</h2>
      <p className="mt-1 text-sm text-ink/65">Use o e-mail cadastrado na franqueadora.</p>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        <Campo label="E-mail">
          <input className={inputClass} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo label="Senha">
          <input className={inputClass} type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Button type="submit" className="w-full" disabled={ocupado}>
          {ocupado ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        <Link to="/recuperar" className="font-semibold text-brand">
          Esqueci a senha
        </Link>
      </p>
      <p className="mt-2 text-sm text-ink/70">
        Ainda não tem acesso?{' '}
        <Link to="/cadastro" className="font-semibold text-ink">
          Criar conta
        </Link>
      </p>
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
      <h2 className="text-2xl font-extrabold">Criar conta</h2>
      <p className="mt-1 text-sm text-ink/65">A franqueadora aprova o acesso antes da biblioteca abrir.</p>
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
  const { recuperar } = useAuth()
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState('')
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
      <h2 className="text-2xl font-extrabold">Recuperar senha</h2>
      <form onSubmit={enviar} className="mt-6 space-y-4">
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
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

export function AguardandoPage() {
  const { status, user, sair } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (status === 'ready') navigate('/')
    if (status === 'signedOut') navigate('/entrar')
  }, [status, navigate])
  const recusado = status === 'rejected' || user?.recusado
  return (
    <Moldura>
      <h2 className="text-2xl font-extrabold">{recusado ? 'Cadastro não aprovado' : 'Aguardando aprovação'}</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink/70">
        {recusado
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
  const { status, firebaseUser, completarCadastro } = useAuth()
  const [form, setForm] = useState({ nome: firebaseUser?.displayName ?? '', unidade: '', cidade: '' })
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
      <h2 className="text-2xl font-extrabold">Concluir cadastro</h2>
      <p className="mt-1 text-sm text-ink/65">Sua conta existe, e o perfil da franquia ainda precisa ser gravado.</p>
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
  return firebaseConfigured
}
