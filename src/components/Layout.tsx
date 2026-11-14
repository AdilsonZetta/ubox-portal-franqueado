import { Bell, BookOpen, GraduationCap, Home, LogOut, Menu, MessageCircle, Search, Shield, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { usePortal } from '../lib/portal'
import { Logo } from './Logo'
import { cx } from './ui'

const links = [
  { to: '/', label: 'Início', icon: Home, fim: true },
  { to: '/biblioteca', label: 'Biblioteca', icon: BookOpen },
  { to: '/trilhas', label: 'Trilhas', icon: GraduationCap },
  { to: '/pergunte', label: 'Pergunte', icon: MessageCircle },
]

export function Layout() {
  const { user, sair } = useAuth()
  const { avisos, avisosLidos } = usePortal()
  const [aberto, setAberto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const navigate = useNavigate()
  const imprimir = useMatch('/documento/:id/imprimir')
  const naoLidos = avisos.filter((aviso) => !avisosLidos.includes(aviso.id)).length

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        evento.preventDefault()
        document.getElementById('busca-portal')?.focus()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  if (imprimir) return <Outlet />

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.fim}
          onClick={() => setAberto(false)}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-white/10 text-white shadow-[inset_3px_0_0_#f37021]' : 'text-white/75 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <link.icon className="h-4 w-4" />
          {link.label}
        </NavLink>
      ))}
      {user?.papel === 'admin' ? (
        <NavLink
          to="/admin"
          onClick={() => setAberto(false)}
          className={({ isActive }) =>
            cx(
              'mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
              isActive ? 'bg-white/10 text-white' : 'text-lime hover:bg-white/5',
            )
          }
        >
          <Shield className="h-4 w-4" />
          Painel da franqueadora
        </NavLink>
      ) : null}
    </nav>
  )

  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink px-4 py-5 text-white lg:flex">
        <Logo claro />
        <div className="mt-8">{nav}</div>
        <p className="mt-auto px-2 text-[11px] leading-relaxed text-white/45">Ubox Self Storage · Uberaba/MG</p>
      </aside>

      {aberto ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-ink/50" aria-label="Fechar menu" onClick={() => setAberto(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-ink px-4 py-5 text-white">
            <div className="flex items-center justify-between">
              <Logo claro />
              <button onClick={() => setAberto(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-8">{nav}</div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur md:px-8">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setAberto(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(evento) => {
              evento.preventDefault()
              navigate(`/busca?q=${encodeURIComponent(consulta.trim())}`)
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
            <input
              id="busca-portal"
              value={consulta}
              onChange={(evento) => setConsulta(evento.target.value)}
              placeholder="Buscar POPs, manuais e políticas"
              className="w-full rounded-xl border border-line bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-brand/30 focus:border-brand focus:ring-2"
            />
          </form>
          <NavLink to="/notificacoes" className="relative rounded-xl border border-line bg-white p-2.5" aria-label="Notificações">
            <Bell className="h-4 w-4" />
            {naoLidos > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {naoLidos}
              </span>
            ) : null}
          </NavLink>
          <NavLink to="/perfil" className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">
            {user?.nome}
          </NavLink>
          <button onClick={() => void sair()} className="rounded-xl border border-line bg-white p-2.5" aria-label="Sair">
            <LogOut className="h-4 w-4" />
          </button>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-white lg:hidden">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.fim}
            className={({ isActive }) =>
              cx('flex flex-col items-center gap-1 py-2 text-[11px]', isActive ? 'text-brand' : 'text-ink/55')
            }
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="h-16 lg:hidden" />
    </div>
  )
}
