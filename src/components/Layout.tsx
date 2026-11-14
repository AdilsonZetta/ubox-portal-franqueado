import { Bell, BookOpen, ChevronRight, ClipboardCheck, Folder, GraduationCap, Home, LayoutTemplate, LogOut, Menu, MessageCircle, Search, Shield, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { usePortal } from '../lib/portal'
import { filhosDe } from '../lib/trilha'
import { Logo } from './Logo'
import { cx } from './ui'

const links = [
  { to: '/', label: 'Início', icon: Home, fim: true },
  { to: '/biblioteca', label: 'Documentos', icon: BookOpen },
  { to: '/trilhas', label: 'Trilhas', icon: GraduationCap },
  { to: '/atribuicoes', label: 'Atribuições', icon: ClipboardCheck },
  { to: '/modelos', label: 'Modelos', icon: LayoutTemplate },
  { to: '/pergunte', label: 'Pergunte', icon: MessageCircle },
]

export function Layout() {
  const { user, sair } = useAuth()
  const { avisos, avisosLidos, categorias, documentos } = usePortal()
  const [aberto, setAberto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const navigate = useNavigate()
  const imprimir = useMatch('/documento/:id/imprimir')
  const naoLidos = avisos.filter((aviso) => !avisosLidos.includes(aviso.id)).length
  const areas = useMemo(() => filhosDe(categorias, null), [categorias])

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

  function buscar(evento: FormEvent) {
    evento.preventDefault()
    const texto = consulta.trim()
    if (!texto) return
    const destino = texto.endsWith('?') ? `/pergunte?q=${encodeURIComponent(texto)}` : `/busca?q=${encodeURIComponent(texto)}`
    navigate(destino)
    setAberto(false)
  }

  const miolo = (
    <>
      <Logo />
      <form onSubmit={buscar} className="relative mt-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
        <input
          id="busca-portal"
          value={consulta}
          onChange={(evento) => setConsulta(evento.target.value)}
          placeholder="Pergunte ou busque um POP"
          className="w-full rounded-xl border border-line bg-paper py-2.5 pl-9 pr-3 text-sm outline-none ring-brand/30 focus:border-brand focus:bg-white focus:ring-2"
        />
      </form>
      <nav className="mt-4 flex flex-col gap-0.5">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.fim}
            onClick={() => setAberto(false)}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium',
                isActive ? 'bg-brand/10 text-brand-dark' : 'text-ink/70 hover:bg-paper',
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
              cx('mt-2 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium', isActive ? 'bg-brand/10 text-brand-dark' : 'text-ink/70 hover:bg-paper')
            }
          >
            <Shield className="h-4 w-4" />
            Relatórios
          </NavLink>
        ) : null}
      </nav>
      <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/40">Áreas</p>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {areas.map((area) => {
          const quantidade = documentos.filter((documento) => documento.categoriaId === area.id && (documento.status === 'publicado' || user?.papel === 'admin')).length
          return (
            <NavLink
              key={area.id}
              to={`/biblioteca/${area.id}`}
              onClick={() => setAberto(false)}
              className={({ isActive }) =>
                cx('flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm', isActive ? 'bg-paper font-semibold text-ink' : 'text-ink/70 hover:bg-paper')
              }
            >
              <Folder className="h-3.5 w-3.5 shrink-0 text-brand" />
              <span className="truncate">{area.nome.replace(/^\d+\s*/, '')}</span>
              <span className="ml-auto text-[11px] text-ink/35">{quantidade}</span>
            </NavLink>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <NavLink to="/perfil" className="min-w-0 flex-1" onClick={() => setAberto(false)}>
          <span className="block truncate text-sm font-semibold">{user?.nome}</span>
          <span className="block truncate text-[11px] text-ink/45">{user?.papel === 'admin' ? 'Franqueadora' : user?.unidade || 'Franqueado'}</span>
        </NavLink>
        <button onClick={() => void sair()} className="rounded-lg p-2 text-ink/50 hover:bg-paper" aria-label="Sair">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-line bg-white px-4 py-5 lg:flex">{miolo}</aside>
      {aberto ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-ink/40" aria-label="Fechar menu" onClick={() => setAberto(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[300px] flex-col bg-white px-4 py-5 shadow-xl">
            <button className="absolute right-3 top-4" onClick={() => setAberto(false)} aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
            {miolo}
          </aside>
        </div>
      ) : null}
      <div className="lg:pl-[272px]">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button className="rounded-lg p-2" onClick={() => setAberto(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <Logo compacto />
          <span className="text-sm font-semibold">Portal Ubox</span>
          <NavLink to="/notificacoes" className="relative ml-auto rounded-lg p-2" aria-label="Notificações">
            <Bell className="h-4 w-4" />
            {naoLidos > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand" /> : null}
          </NavLink>
        </header>
        <div className="no-print hidden items-center justify-end gap-2 px-8 pt-4 lg:flex">
          <NavLink to="/notificacoes" className="relative inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink/70">
            <Bell className="h-4 w-4" />
            Avisos
            {naoLidos > 0 ? <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{naoLidos}</span> : null}
            <ChevronRight className="h-3.5 w-3.5" />
          </NavLink>
        </div>
        <main className="px-4 py-5 md:px-8 md:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
