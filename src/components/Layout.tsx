import { Bell, BookOpen, ChevronDown, ClipboardCheck, Folder, Home, LayoutTemplate, LogOut, Menu, MessageCircle, Route as RotaIcon, Search, Shield, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { GRUPOS, MODULOS } from '../data/modulos'
import { useAuth } from '../lib/auth'
import { observarPendentes } from '../lib/chamados'
import { podeModulo } from '../lib/modulosAcesso'
import { podeGerirTrilha } from '../lib/manuaisTrilha'
import { podeGerirUniversidade } from '../lib/universidade'
import { podeGerirMarketing } from '../lib/marketing'
import { podeGerirChecklist } from '../lib/checklist'
import { podeGerirEstoque } from '../lib/estoque'
import { podeGerirCrm } from '../lib/crm'
import { observarSolicitacoesAbertas } from '../lib/senhas'
import { usePortal } from '../lib/portal'
import { filhosDe } from '../lib/trilha'
import { useVisao } from '../lib/visao'
import { Logo } from './Logo'
import { cx } from './ui'

const CHAVE = 'ubox-modulo-expandido'

const itensManuais = [
  { to: '/manuais', label: 'Início', icon: Home, fim: true },
  { to: '/manuais/trilha', label: 'Trilha de manuais', icon: RotaIcon },
  { to: '/manuais/gestao', label: 'Gestão da trilha', icon: SlidersHorizontal, gestao: true },
  { to: '/biblioteca', label: 'Documentos', icon: BookOpen },
  { to: '/atribuicoes', label: 'Atribuições', icon: ClipboardCheck, admin: true },
  { to: '/modelos', label: 'Modelos', icon: LayoutTemplate, admin: true },
  { to: '/pergunte', label: 'Pergunte', icon: MessageCircle },
  { to: '/admin', label: 'Relatórios', icon: Shield, admin: true },
]

function moduloDaRota(pathname: string): string | null {
  if (pathname.startsWith('/modulos/')) return pathname.split('/')[2] || null
  if (pathname.startsWith('/marketing')) return 'marketing'
  if (pathname.startsWith('/checklist')) return 'checklist'
  if (pathname.startsWith('/estoque')) return 'estoque'
  if (pathname.startsWith('/crm')) return 'crm'
  if (pathname.startsWith('/clientes')) return 'cliente'
  // Auditorias da unidade: não dependem de módulo (a auditoria é da franqueadora; as rules limitam à própria unidade).
  if (pathname.startsWith('/auditorias')) return null
  // Acompanhamento da unidade: também não depende de módulo (só os registros compartilhados).
  if (pathname.startsWith('/meu-acompanhamento')) return null
  if (pathname.startsWith('/acompanhamento')) return 'acompanhamento'
  if (pathname.startsWith('/auditoria')) return 'auditoria'
  if (pathname.startsWith('/universidade') || pathname.startsWith('/trilhas') || pathname.startsWith('/certificado') || pathname.startsWith('/meus-certificados')) return 'universidade'
  if (pathname.startsWith('/chamados')) return 'chamados'
  if (pathname.startsWith('/senhas')) return 'senhas'
  if (pathname.startsWith('/franqueadora')) return 'gestao-franqueadora'
  if (pathname.startsWith('/gestao-usuarios')) return 'gestao-usuarios'
  if (pathname === '/' || pathname.startsWith('/minha-equipe')) return null
  return 'manuais'
}

export function Layout() {
  const { user, sair } = useAuth()
  const { comoFranqueado, ehAdmin, alternar, simulado, franqueados, escolher } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const { avisos, avisosLidos, categorias, documentos } = usePortal()
  const [menuAberto, setMenuAberto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [expandido, setExpandido] = useState(() => localStorage.getItem(CHAVE) || 'manuais')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const imprimir = useMatch('/documento/:id/imprimir')
  const naoLidos = avisos.filter((aviso) => !avisosLidos.includes(aviso.id)).length
  const redeChamados = Boolean(user && (user.papel === 'admin' || user.papel === 'equipe_franqueadora') && !comoFranqueado)
  const unidadeChamados = comoFranqueado ? simulado?.unidadeId : user?.unidadeId
  const podeChamados = Boolean(user && (ehAdmin || podeModulo(pessoa, 'chamados', comoFranqueado)))
  const [pendentes, setPendentes] = useState(0)

  const redeSenhas = Boolean(user && (user.papel === 'admin' || user.papel === 'equipe_franqueadora') && !comoFranqueado)
  const unidadeSenhas = comoFranqueado ? simulado?.unidadeId : user?.unidadeId
  const podeSenhas = Boolean(user && (ehAdmin || podeModulo(pessoa, 'senhas', comoFranqueado)))
  const [solicitacoesAbertas, setSolicitacoesAbertas] = useState(0)
  const areas = useMemo(() => filhosDe(categorias, null), [categorias])

  useEffect(() => {
    if (!podeChamados || (!redeChamados && !unidadeChamados)) {
      setPendentes(0)
      return
    }
    return observarPendentes({ rede: redeChamados, unidadeId: unidadeChamados }, setPendentes)
  }, [podeChamados, redeChamados, unidadeChamados])

  useEffect(() => {
    if (!podeSenhas || (!redeSenhas && !unidadeSenhas)) {
      setSolicitacoesAbertas(0)
      return
    }
    return observarSolicitacoesAbertas({ rede: redeSenhas, unidadeId: unidadeSenhas }, setSolicitacoesAbertas)
  }, [podeSenhas, redeSenhas, unidadeSenhas])

  useEffect(() => {
    const dono = moduloDaRota(pathname)
    if (!dono) return
    setExpandido(dono)
    localStorage.setItem(CHAVE, dono)
  }, [pathname])

  useEffect(() => {
    const dono = moduloDaRota(pathname)
    if (!dono || ehAdmin) return
    if (!podeModulo(pessoa, dono, comoFranqueado)) navigate('/')
  }, [pathname, ehAdmin, pessoa, comoFranqueado, navigate])

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
        {GRUPOS.map((grupo) => {
          const doGrupo = MODULOS.filter((modulo) => modulo.grupo === grupo && (ehAdmin || podeModulo(pessoa, modulo.slug, comoFranqueado)))
          if (!doGrupo.length) return null
          return (
          <div key={grupo}>
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/35">{grupo}</p>
            <div className="mt-1 space-y-0.5">
              {doGrupo.map((modulo) => {
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
                      {modulo.slug === 'chamados' && pendentes > 0 ? (
                        <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{pendentes}</span>
                      ) : null}
                      {modulo.slug === 'senhas' && solicitacoesAbertas > 0 ? (
                        <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{solicitacoesAbertas}</span>
                      ) : null}
                      <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-ink/35 transition', aberto && 'rotate-180')} />
                    </button>
                    {aberto ? (
                      <div className="mb-1 ml-4 mt-0.5 space-y-0.5 border-l border-line pl-2">
                        {modulo.slug === 'manuais'
                          ? itensManuais
                              .filter((item) => (!item.admin || ehAdmin) && (!item.gestao || (podeGerirTrilha(user, ehAdmin) && !comoFranqueado)))
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
                            <NavLink to="/universidade" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Cursos
                            </NavLink>
                            {podeGerirUniversidade(user, ehAdmin) && !comoFranqueado ? (
                              <NavLink to="/universidade/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                                Gestão da Universidade
                              </NavLink>
                            ) : null}
                            <NavLink to="/meus-certificados" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Meus certificados
                            </NavLink>
                          </>
                        ) : null}
                        {modulo.slug === 'checklist' ? (
                          <>
                            {!(podeGerirChecklist(user, ehAdmin) && !comoFranqueado) ? (
                              <>
                                <NavLink to="/checklist" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                                  Rotinas da unidade
                                </NavLink>
                                <NavLink to="/checklist/historico" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                                  Histórico
                                </NavLink>
                                <NavLink to="/checklist/nao-conformidades" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                                  Não conformidades
                                </NavLink>
                              </>
                            ) : (
                              <NavLink to="/checklist/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                                Gestão do checklist
                              </NavLink>
                            )}
                          </>
                        ) : null}
                        {modulo.slug === 'estoque' ? (
                          podeGerirEstoque(user, ehAdmin) && !comoFranqueado ? (
                            <NavLink to="/estoque/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Gestão do estoque
                            </NavLink>
                          ) : (
                            <NavLink to="/estoque" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Estoque da unidade
                            </NavLink>
                          )
                        ) : null}
                        {modulo.slug === 'crm' ? (
                          podeGerirCrm(user, ehAdmin) && !comoFranqueado ? (
                            <NavLink to="/crm/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Desempenho da rede
                            </NavLink>
                          ) : (
                            <NavLink to="/crm" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Funil de locação
                            </NavLink>
                          )
                        ) : null}
                        {modulo.slug === 'cliente' ? (
                          <NavLink to="/clientes" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                            Clientes e contratos
                          </NavLink>
                        ) : null}
                        {modulo.slug === 'auditoria' ? (
                          <>
                            <NavLink to="/auditoria" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Auditorias da rede
                            </NavLink>
                            <NavLink to="/auditoria/nova" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Nova auditoria
                            </NavLink>
                            <Link to="/auditoria?aba=modelos" onClick={() => setMenuAberto(false)} className="block rounded-md px-2 py-1 text-[13px] text-ink/70 hover:bg-paper">
                              Modelos
                            </Link>
                            <Link to="/auditoria?aba=acoes" onClick={() => setMenuAberto(false)} className="block rounded-md px-2 py-1 text-[13px] text-ink/70 hover:bg-paper">
                              Planos de ação
                            </Link>
                          </>
                        ) : null}
                        {modulo.slug === 'acompanhamento' ? (
                          <NavLink to="/acompanhamento" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                            Visão da rede
                          </NavLink>
                        ) : null}
                        {modulo.slug === 'marketing' ? (
                          <>
                            <NavLink to="/marketing" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Materiais
                            </NavLink>
                            <NavLink to="/marketing/calendario" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Calendário
                            </NavLink>
                            <NavLink to="/marketing/pedidos" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                              Pedidos de peça
                            </NavLink>
                            {podeGerirMarketing(user, ehAdmin) && !comoFranqueado ? (
                              <NavLink to="/marketing/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                                Gestão do marketing
                              </NavLink>
                            ) : null}
                          </>
                        ) : null}
                        {modulo.slug === 'senhas' ? (
                          <>
                            <NavLink
                              to="/senhas"
                              end
                              onClick={() => setMenuAberto(false)}
                              className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}
                            >
                              Cofre da unidade
                            </NavLink>
                            <NavLink
                              to="/senhas/solicitacoes"
                              onClick={() => setMenuAberto(false)}
                              className={({ isActive }) => cx('flex items-center justify-between rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}
                            >
                              <span>Solicitações</span>
                              {solicitacoesAbertas > 0 ? (
                                <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{solicitacoesAbertas}</span>
                              ) : null}
                            </NavLink>
                            <NavLink
                              to="/senhas/permissoes"
                              onClick={() => setMenuAberto(false)}
                              className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}
                            >
                              Permissões
                            </NavLink>
                          </>
                        ) : null}
                        {modulo.ativo && modulo.para && modulo.slug !== 'manuais' && modulo.slug !== 'universidade' && modulo.slug !== 'senhas' && modulo.slug !== 'marketing' && modulo.slug !== 'checklist' && modulo.slug !== 'estoque' && modulo.slug !== 'crm' && modulo.slug !== 'cliente' && modulo.slug !== 'auditoria' && modulo.slug !== 'acompanhamento' ? (
                          <NavLink to={modulo.para} onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-md px-2 py-1 text-[13px]', isActive ? 'font-semibold text-brand-dark' : 'text-ink/70 hover:bg-paper')}>
                            Abrir
                          </NavLink>
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
          )
        })}
      </nav>
      {user?.papel === 'franqueado' && !comoFranqueado ? (
        <NavLink to="/minha-equipe" onClick={() => setMenuAberto(false)} className="mt-3 block shrink-0 rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-paper">
          Minha equipe
        </NavLink>
      ) : null}
      {(user?.papel === 'franqueado' || user?.papel === 'equipe_franqueado') && !comoFranqueado ? (
        <NavLink to="/auditorias" onClick={() => setMenuAberto(false)} className="mt-2 block shrink-0 rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-paper">
          Auditorias da unidade
        </NavLink>
      ) : null}
      {(user?.papel === 'franqueado' || user?.papel === 'equipe_franqueado') && !comoFranqueado ? (
        <NavLink to="/meu-acompanhamento" onClick={() => setMenuAberto(false)} className="mt-2 block shrink-0 rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-paper">
          Acompanhamento
        </NavLink>
      ) : null}
      {user?.papel === 'admin' ? (
        <div className="mt-3 shrink-0 space-y-2">
          <button type="button" onClick={alternar} className="w-full rounded-xl border border-brand/40 px-3 py-2 text-left text-sm font-semibold text-brand-dark hover:bg-brand/10">
            {comoFranqueado ? 'Voltar para franqueadora' : 'Ver como franqueado'}
          </button>
          {comoFranqueado ? (
            <select
              value={simulado?.uid ?? ''}
              onChange={(evento) => escolher(evento.target.value)}
              className="w-full rounded-xl border border-line bg-white px-2 py-2 text-sm"
            >
              <option value="">Escolha o franqueado</option>
              {franqueados.map((pessoa) => (
                <option key={pessoa.uid} value={pessoa.uid}>
                  {pessoa.unidade || pessoa.nome}
                </option>
              ))}
            </select>
          ) : null}
        </div>
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
            <span>Visualizando como franqueado{simulado ? ` · ${simulado.unidade || simulado.nome}` : ''}</span>
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
