import { Bell, BookOpen, ChevronDown, ClipboardCheck, Folder, Home, LayoutTemplate, LogOut, Menu, MessageCircle, Search, Shield, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { GRUPOS, MODULOS } from '../data/modulos'
import { useAuth } from '../lib/auth'
import { usePortal } from '../lib/portal'
import { filhosDe } from '../lib/trilha'
import { useVisao } from '../lib/visao'
import { Logo } from './Logo'
import { cx } from './ui'

const CHAVE = 'ubox-modulo-expandido'

const itensManuais = [
  { to: '/manuais', label: 'Início', icon: Home, fim: true },
  { to: '/biblioteca', label: 'Documentos', icon: BookOpen },
  { to: '/atribuicoes', label: 'Atribuições', icon: ClipboardCheck, admin: true },
  { to: '/modelos', label: 'Modelos', icon: LayoutTemplate, admin: true },
  { to: '/pergunte', label: 'Pergunte', icon: MessageCircle },
  { to: '/admin', label: 'Relatórios', icon: Shield, admin: true },
]

function moduloDaRota(pathname: string): string | null {
  if (pathname.startsWith('/modulos/')) return pathname.split('/')[2] || null
  if (pathname.startsWith('/trilhas') || pathname.startsWith('/certificado') || pathname.startsWith('/meus-certificados')) return 'universidade'
  if (pathname === '/') return null
  return 'manuais'
}

export function Layout() {
  const { user, sair } = useAuth()
  const { comoFranqueado, ehAdmin, alternar } = useVisao()
  const { avisos, avisosLidos, categorias, documentos } = usePortal()
  const [menuAberto, setMenuAberto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [expandido, setExpandido] = useState(() => localStorage.getItem(CHAVE) || 'manuais')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const imprimir = useMatch('/documento/:id/imprimir')
  const naoLidos = avisos.filter((aviso) => !avisosLidos.includes(aviso.id)).length
  const areas = useMemo(() => filhosDe(categorias, null), [categorias])

  useEffect(() => {
    const dono = moduloDaRota(pathname)
    if (!dono) return
    setExpandido(dono)
    localStorage.setItem(CHAVE, dono)
  }, [pathname])

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
    setMenuAberto(false)
  }

  function alternarModulo(slug: string) {
    setExpandido((atual) => {
      const proximo = atual === slug ? '' : slug
      localStorage.setItem(CHAVE, proximo)
      return proximo
    })
  }

  const miolo = (
    <>
      <Link to="/" className="block w-fit rounded-xl outline-none ring-brand/30 focus-visible:ring-2" aria-label="Módulos">
        <Logo />
      </Link>
      <form onSubmit={buscar} className="relative mt-4 shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
        <input
          id="busca-portal"
          value={consulta}
          onChange={(evento) => setConsulta(evento.target.value)}
          placeholder="Pergunte ou busque um POP"
          className="w-full rounded-xl border border-line bg-paper py-2.5 pl-9 pr-3 text-sm outline-none ring-brand/30 focus:border-brand focus:bg-white focus:ring-2"
        />
      </form>
      <nav className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {GRUPOS.map((grupo) => (
          <div key={grupo}>
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/35">{grupo}</p>
            <div className="mt-1 space-y-0.5">
              {MODULOS.filter((modulo) => modulo.grupo === grupo).map((modulo) => {
                const aberto = expandido === modulo.slug
                const Icone = modulo.icon
                return (
                  <div key={modulo.slug}>
                    <button
                      type="button"
                      onClick={() => alternarModulo(modulo.slug)}
                      className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', aberto ? 'bg-paper font-semibold text-ink' : 'text-ink/75 hover:bg-paper')}
                    >
                      <Icone className="h-4 w-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1 truncate">{modulo.nome}</span>
                      <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-ink/35 transition', aberto && 'rotate-180')} />
                    </button>
                    {aberto ? (
                      <div className="mb-1 ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2">
                        {modulo.slug === 'manuais'
                          ? itensManuais
                              .filter((item) => !item.admin || ehAdmin)
                              .map((item) => (
                                <NavLink
                                  key={item.to}
                                  to={item.to}
                                  end={item.fim}
                                  onClick={() => setMenuAberto(false)}
                                  className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}
                                >
                                  {item.label}
                                </NavLink>
                              ))
                          : null}
                        {modulo.slug === 'manuais'
                          ? areas.map((area) => {
                              const quantidade = documentos.filter((documento) => documento.categoriaId === area.id && (documento.status === 'publicado' || ehAdmin)).length
                              return (
                                <NavLink
                                  key={area.id}
                                  to={`/biblioteca/${area.id}`}
                                  onClick={() => setMenuAberto(false)}
                                  className={({ isActive }) => cx('flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}
                                >
                                  <Folder className="h-3 w-3 shrink-0 text-brand/80" />
                                  <span className="min-w-0 flex-1 truncate">{area.nome.replace(/^\d+\s*/, '')}</span>
                                  <span className="text-[10px] text-ink/35">{quantidade}</span>
                                </NavLink>
                              )
                            })
                          : null}
                        {modulo.slug === 'universidade' ? (
                          <>
                            <NavLink to="/trilhas" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Trilhas
                            </NavLink>
                            <NavLink to="/meus-certificados" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Meus certificados
                            </NavLink>
                          </>
                        ) : null}
                        {!modulo.ativo
                          ? modulo.recursos.slice(0, 4).map((nome) => (
                              <Link
                                key={nome}
                                to={`/modulos/${modulo.slug}`}
                                onClick={() => setMenuAberto(false)}
                                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink/35 hover:bg-paper"
                              >
                                <span className="min-w-0 flex-1 truncate">{nome}</span>
                                <span className="shrink-0 rounded bg-ink/5 px-1 text-[9px] font-bold uppercase tracking-wide">Em breve</span>
                              </Link>
                            ))
                          : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      {user?.papel === 'admin' ? (
        <button type="button" onClick={alternar} className="mt-3 w-full shrink-0 rounded-xl border border-brand/40 px-3 py-2 text-left text-sm font-semibold text-brand-dark hover:bg-brand/10">
          {comoFranqueado ? 'Voltar para franqueadora' : 'Ver como franqueado'}
        </button>
      ) : null}
      <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-line pt-3">
        <NavLink to="/perfil" className="min-w-0 flex-1" onClick={() => setMenuAberto(false)}>
          <span className="block truncate text-sm font-semibold">{user?.nome}</span>
          <span className="block truncate text-[11px] text-ink/45">{ehAdmin ? 'Franqueadora' : user?.unidade || 'Franqueado'}</span>
        </NavLink>
        <button onClick={() => void sair()} className="rounded-lg p-2 text-ink/50 hover:bg-paper" aria-label="Sair">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-line bg-white px-3 py-4 lg:flex">{miolo}</aside>
      {menuAberto ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-ink/40" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[300px] flex-col bg-white px-3 py-4 shadow-xl">
            <button className="absolute right-3 top-4" onClick={() => setMenuAberto(false)} aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
            {miolo}
          </aside>
        </div>
      ) : null}
      <div className="lg:pl-[272px]">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button className="rounded-lg p-2" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2" aria-label="Módulos">
            <Logo compacto />
            <span className="text-sm font-semibold">Portal Ubox</span>
          </Link>
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
          </NavLink>
        </div>
        {comoFranqueado ? (
          <div className="no-print flex items-center justify-between gap-3 bg-brand px-4 py-2 text-sm font-semibold text-white md:px-8">
            <span>Visualizando como franqueado</span>
            <button type="button" onClick={alternar} className="rounded-lg bg-white px-3 py-1 text-brand-dark">
              Voltar para franqueadora
            </button>
          </div>
        ) : null}
        <main className="px-4 py-5 md:px-8 md:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
