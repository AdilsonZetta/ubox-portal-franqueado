import { Activity, Bell, BookOpen, ChevronDown, ClipboardCheck, Folder, Home, LayoutTemplate, LogOut, Menu, MessageCircle, Route as RotaIcon, Search, Shield, SlidersHorizontal, Upload, UserRound, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { GRUPOS, MODULOS } from '../data/modulos'
import { destinoDaBusca, type ModoBusca } from '../lib/buscaPortal'
import { useAuth } from '../lib/auth'
import { observarPendentes } from '../lib/chamados'
import { podeModulo, podeMostrarModulo } from '../lib/modulosAcesso'
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
import { SeletorUnidadeSimulada } from './SeletorUnidadeSimulada'
import { Logo } from './Logo'
import { cx } from './ui'

const CHAVE = 'ubox-modulo-expandido'
const CHAVE_MODO_BUSCA = 'ubox-modo-busca'
const MODOS_BUSCA = [
  { modo: 'buscar', titulo: 'Buscar', placeholder: 'Buscar documentos e ações' },
  { modo: 'perguntar', titulo: 'Perguntar', placeholder: 'Pergunte ao portal' },
] as const

const itensManuais = [
  { to: '/manuais', label: 'Início', icon: Home, fim: true },
  { to: '/manuais/trilha', label: 'Trilha de manuais', icon: RotaIcon },
  { to: '/manuais/gestao', label: 'Gestão da trilha', icon: SlidersHorizontal, gestao: true },
  { to: '/biblioteca', label: 'Documentos', icon: BookOpen },
  { to: '/atribuicoes', label: 'Atribuições', icon: ClipboardCheck, admin: true },
  { to: '/modelos', label: 'Modelos', icon: LayoutTemplate, admin: true },
  { to: '/pergunte', label: 'Pergunte', icon: MessageCircle },
  { to: '/admin', label: 'Relatórios', icon: Shield, admin: true, fim: true },
  { to: '/admin/importar', label: 'Importar conteúdo', icon: Upload, admin: true },
]

function moduloDaRota(pathname: string): string | null {
  if (pathname.startsWith('/modulos/')) return pathname.split('/')[2] || null
  if (pathname.startsWith('/marketing')) return 'marketing'
  if (pathname.startsWith('/checklist')) return 'checklist'
  if (pathname.startsWith('/estoque')) return 'estoque'
  if (pathname.startsWith('/crm')) return 'crm'
  if (pathname.startsWith('/clientes')) return 'cliente'
  if (pathname.startsWith('/nuvem/rede')) return 'nuvem-rede'
  if (pathname.startsWith('/nuvem')) return 'nuvem'
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
  if (pathname === '/' || pathname === '/busca' || pathname.startsWith('/minha-equipe')) return null
  return 'manuais'
}

// Menu lateral adaptado de shadcn-admin (MIT, https://github.com/satnaing/shadcn-admin)
export function Layout() {
  const { user, sair } = useAuth()
  const { comoFranqueado, ehAdmin, alternar, simulado, unidadeSimulada } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const { avisos, avisosLidos, categorias, documentos } = usePortal()
  const [menuAberto, setMenuAberto] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [modoBusca, setModoBusca] = useState<ModoBusca>(() => localStorage.getItem(CHAVE_MODO_BUSCA) === 'perguntar' ? 'perguntar' : 'buscar')
  const podePerguntar = ehAdmin || podeModulo(pessoa, 'manuais', comoFranqueado)
  const modoAtual = podePerguntar ? modoBusca : 'buscar'
  const placeholderBusca = (modoAtual === 'buscar' ? MODOS_BUSCA[0] : MODOS_BUSCA[1]).placeholder
  const [expandido, setExpandido] = useState(() => localStorage.getItem(CHAVE) || 'manuais')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const imprimir = useMatch('/documento/:id/imprimir')
  const gereManuais = podeGerirTrilha(user, ehAdmin)
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
    const destino = destinoDaBusca(consulta, modoAtual)
    if (!destino) return
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
        <Logo claro />
      </Link>
      <form onSubmit={buscar} role="search" aria-label="Busca no menu" className="mt-4 shrink-0 space-y-2">
        <div role="group" aria-label="Modo da busca" className="grid grid-cols-2 gap-1 rounded-xl border border-line-control bg-sidebar-field p-1">
          {MODOS_BUSCA.map(({ modo, titulo }) => (
            <button
              key={modo}
              type="button"
              aria-pressed={modoAtual === modo}
              disabled={modo === 'perguntar' && !podePerguntar}
              title={modo === 'perguntar' && !podePerguntar ? 'Disponível com o módulo Manuais' : undefined}
              onClick={() => {
                setModoBusca(modo)
                localStorage.setItem(CHAVE_MODO_BUSCA, modo)
              }}
              className={cx('min-h-8 rounded-lg px-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-lime disabled:opacity-50',
                modoAtual === modo ? 'bg-lime text-ink' : 'text-sidebar-muted hover:bg-surface/10 hover:text-surface')}
            >
              {titulo}
            </button>
          ))}
        </div>
        <div className="relative">
          <input
            id="busca-portal"
            type="search"
            name="q"
            autoComplete="off"
            aria-label={placeholderBusca}
            value={consulta}
            onChange={(evento) => setConsulta(evento.target.value)}
            placeholder={placeholderBusca}
            className="w-full rounded-xl border border-line-control bg-sidebar-field py-2.5 pl-3 pr-11 text-sm transition-portal motion-reduce:transition-none"
          />
          <button type="submit" aria-label={modoAtual === 'buscar' ? 'Buscar' : 'Perguntar'} className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-sidebar-muted hover:bg-surface/10 hover:text-surface">
            {modoAtual === 'buscar' ? <Search className="size-4" aria-hidden="true" /> : <MessageCircle className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </form>
      <nav className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-1">
        {GRUPOS.map((grupo) => {
          const doGrupo = MODULOS.filter((modulo) => modulo.grupo === grupo && podeMostrarModulo(pessoa, modulo.slug, { ehAdmin, simulando: comoFranqueado }))
          if (!doGrupo.length) return null
          return (
          <div key={grupo}>
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">{grupo}</p>
            <div className="mt-1 space-y-0.5">
              {doGrupo.map((modulo) => {
                const aberto = expandido === modulo.slug
                const Icone = modulo.icon
                return (
                  <div key={modulo.slug}>
                    <button
                      type="button"
                      onClick={() => alternarModulo(modulo.slug)}
                      className={cx('flex min-h-9 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', aberto ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}
                    >
                      <Icone className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 wrap-anywhere">{modulo.nome}</span>
                      {modulo.slug === 'chamados' && pendentes > 0 ? (
                        <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{pendentes}</span>
                      ) : null}
                      {modulo.slug === 'senhas' && solicitacoesAbertas > 0 ? (
                        <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{solicitacoesAbertas}</span>
                      ) : null}
                      <ChevronDown className={cx('h-3.5 w-3.5 shrink-0', aberto && 'rotate-180')} />
                    </button>
                    {aberto ? (
                      <div className="mb-1 ml-4 mt-0.5 space-y-0.5 border-l border-surface/20 pl-2">
                        {modulo.slug === 'manuais'
                          ? itensManuais
                              .filter((item) => (!item.admin || ehAdmin) && (!item.gestao || gereManuais))
                              .map((item) => (
                                <NavLink
                                  key={item.to}
                                  to={item.to}
                                  end={item.fim}
                                  onClick={() => setMenuAberto(false)}
                                  className={({ isActive }) => cx('flex items-center gap-2 rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}
                                >
                                  <item.icon className="size-3.5 shrink-0" aria-hidden="true" />
                                  <span className="min-w-0 wrap-anywhere">{item.label}</span>
                                </NavLink>
                              ))
                          : null}
                        {modulo.slug === 'manuais'
                          ? areas.map((area) => {
                              const quantidade = documentos.filter((documento) => documento.categoriaId === area.id && (documento.status === 'publicado' || gereManuais)).length
                              return (
                                <NavLink
                                  key={area.id}
                                  to={`/biblioteca/${area.id}`}
                                  onClick={() => setMenuAberto(false)}
                                  className={({ isActive }) => cx('flex items-center gap-1.5 rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}
                                >
                                  <Folder className="h-3 w-3 shrink-0" />
                                  <span className="min-w-0 flex-1 wrap-anywhere">{area.nome.replace(/^\d+\s*/, '')}</span>
                                  <span className="text-[10px]">{quantidade}</span>
                                </NavLink>
                              )
                            })
                          : null}
                        {modulo.slug === 'universidade' ? (
                          <>
                            <NavLink to="/universidade" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Cursos
                            </NavLink>
                            {podeGerirUniversidade(user, ehAdmin) && !comoFranqueado ? (
                              <NavLink to="/universidade/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                                Gestão da Universidade
                              </NavLink>
                            ) : null}
                            <NavLink to="/meus-certificados" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Meus certificados
                            </NavLink>
                          </>
                        ) : null}
                        {modulo.slug === 'checklist' ? (
                          <>
                            {!(podeGerirChecklist(user, ehAdmin) && !comoFranqueado) ? (
                              <>
                                <NavLink to="/checklist" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                                  Rotinas da unidade
                                </NavLink>
                                <NavLink to="/checklist/historico" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                                  Histórico
                                </NavLink>
                                <NavLink to="/checklist/nao-conformidades" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                                  Não conformidades
                                </NavLink>
                              </>
                            ) : (
                              <NavLink to="/checklist/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                                Gestão do checklist
                              </NavLink>
                            )}
                          </>
                        ) : null}
                        {modulo.slug === 'estoque' ? (
                          podeGerirEstoque(user, ehAdmin) && !comoFranqueado ? (
                            <NavLink to="/estoque/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Gestão do estoque
                            </NavLink>
                          ) : (
                            <NavLink to="/estoque" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Estoque da unidade
                            </NavLink>
                          )
                        ) : null}
                        {modulo.slug === 'crm' ? (
                          podeGerirCrm(user, ehAdmin) && !comoFranqueado ? (
                            <NavLink to="/crm/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Desempenho da rede
                            </NavLink>
                          ) : (
                            <NavLink to="/crm" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Funil de locação
                            </NavLink>
                          )
                        ) : null}
                        {modulo.slug === 'cliente' ? (
                          <NavLink to="/clientes" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                            Clientes e contratos
                          </NavLink>
                        ) : null}
                        {modulo.slug === 'auditoria' ? (
                          <>
                            <NavLink to="/auditoria" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Auditorias da rede
                            </NavLink>
                            <NavLink to="/auditoria/nova" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Nova auditoria
                            </NavLink>
                            <Link to="/auditoria?aba=modelos" onClick={() => setMenuAberto(false)} className="block rounded-[10px] px-2 py-2 text-sm text-line-strong hover:bg-surface/10 hover:text-surface">
                              Modelos
                            </Link>
                            <Link to="/auditoria?aba=acoes" onClick={() => setMenuAberto(false)} className="block rounded-[10px] px-2 py-2 text-sm text-line-strong hover:bg-surface/10 hover:text-surface">
                              Planos de ação
                            </Link>
                          </>
                        ) : null}
                        {modulo.slug === 'acompanhamento' ? (
                          <NavLink to="/acompanhamento" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                            Visão da rede
                          </NavLink>
                        ) : null}
                        {modulo.slug === 'marketing' ? (
                          <>
                            <NavLink to="/marketing" end onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Materiais
                            </NavLink>
                            <NavLink to="/marketing/calendario" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Calendário
                            </NavLink>
                            <NavLink to="/marketing/pedidos" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                              Pedidos de peça
                            </NavLink>
                            {podeGerirMarketing(user, ehAdmin) && !comoFranqueado ? (
                              <NavLink to="/marketing/gestao" onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
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
                              className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}
                            >
                              Cofre da unidade
                            </NavLink>
                            <NavLink
                              to="/senhas/solicitacoes"
                              onClick={() => setMenuAberto(false)}
                              className={({ isActive }) => cx('flex items-center justify-between rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}
                            >
                              <span>Solicitações</span>
                              {solicitacoesAbertas > 0 ? (
                                <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{solicitacoesAbertas}</span>
                              ) : null}
                            </NavLink>
                            <NavLink
                              to="/senhas/permissoes"
                              onClick={() => setMenuAberto(false)}
                              className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}
                            >
                              Permissões
                            </NavLink>
                          </>
                        ) : null}
                        {modulo.ativo && modulo.para && modulo.slug !== 'manuais' && modulo.slug !== 'universidade' && modulo.slug !== 'senhas' && modulo.slug !== 'marketing' && modulo.slug !== 'checklist' && modulo.slug !== 'estoque' && modulo.slug !== 'crm' && modulo.slug !== 'cliente' && modulo.slug !== 'auditoria' && modulo.slug !== 'acompanhamento' ? (
                          <NavLink to={modulo.para} onClick={() => setMenuAberto(false)} className={({ isActive }) => cx('block rounded-[10px] px-2 py-2 text-sm', isActive ? 'bg-lime font-semibold text-ink' : 'text-line-strong hover:bg-surface/10 hover:text-surface')}>
                            Abrir
                          </NavLink>
                        ) : null}
                        {!modulo.ativo
                          ? modulo.recursos.slice(0, 4).map((nome) => (
                              <Link
                                key={nome}
                                to={`/modulos/${modulo.slug}`}
                                onClick={() => setMenuAberto(false)}
                                className="flex items-center gap-1.5 rounded-[10px] px-2 py-2 text-sm text-sidebar-muted hover:bg-surface/10"
                              >
                                <span className="min-w-0 flex-1 wrap-anywhere">{nome}</span>
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
        <NavLink to="/minha-equipe" onClick={() => setMenuAberto(false)} className="atalho-lateral mt-3">
          <Users className="size-4 shrink-0" aria-hidden="true" />
          Minha equipe
        </NavLink>
      ) : null}
      {(user?.papel === 'franqueado' || user?.papel === 'equipe_franqueado') && !comoFranqueado ? (
        <NavLink to="/auditorias" onClick={() => setMenuAberto(false)} className="atalho-lateral">
          <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" />
          Auditorias da unidade
        </NavLink>
      ) : null}
      {(user?.papel === 'franqueado' || user?.papel === 'equipe_franqueado') && !comoFranqueado ? (
        <NavLink to="/meu-acompanhamento" onClick={() => setMenuAberto(false)} className="atalho-lateral">
          <Activity className="size-4 shrink-0" aria-hidden="true" />
          Acompanhamento
        </NavLink>
      ) : null}
      {user?.papel === 'admin' ? (
        <div className="mt-3 shrink-0 space-y-2">
          <button type="button" onClick={() => { alternar(); setMenuAberto(false); navigate('/') }} className="atalho-lateral w-full text-left">
            <UserRound className="size-4 shrink-0" aria-hidden="true" />
            {comoFranqueado ? 'Voltar para franqueadora' : 'Ver como franqueado'}
          </button>
          {comoFranqueado ? <SeletorUnidadeSimulada lateral /> : null}
        </div>
      ) : null}
      <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-surface/20 pt-3">
        <NavLink to="/perfil" className="min-w-0 flex-1" onClick={() => setMenuAberto(false)}>
          <span className="block truncate text-sm font-semibold">{pessoa?.nome || 'Escolha a unidade'}</span>
          <span className="block truncate text-[11px] text-sidebar-muted">{ehAdmin ? 'Franqueadora' : pessoa?.unidade || 'Franqueado'}</span>
        </NavLink>
        <button onClick={() => void sair()} className="rounded-lg p-2 text-line-strong hover:bg-surface/10" aria-label="Sair">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-paper text-ink">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:text-ink"
        onClick={(evento) => {
          evento.preventDefault()
          document.getElementById('conteudo')?.focus()
        }}
      >
        Pular para o conteúdo
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 portal-lateral hidden w-[272px] flex-col bg-graphite px-4 py-5 text-surface lg:flex">{miolo}</aside>
      {menuAberto ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-ink/40" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} />
          <aside className="absolute inset-y-0 left-0 portal-lateral flex w-[min(300px,100%)] flex-col bg-graphite px-4 py-5 text-surface shadow-xl">
            <button className="absolute right-3 top-4 grid size-11 place-items-center rounded-[10px]" onClick={() => setMenuAberto(false)} aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
            {miolo}
          </aside>
        </div>
      ) : null}
      <div className="lg:pl-[272px]">
        <header className="no-print sticky top-0 z-20 flex items-center gap-2 bg-graphite px-3 py-2 text-surface lg:hidden">
          <button className="grid size-11 place-items-center rounded-[10px]" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex min-h-11 items-center gap-2" aria-label="Módulos">
            <Logo compacto />
            <span className="text-sm font-semibold">Portal Ubox</span>
          </Link>
          <NavLink to="/notificacoes" className="relative ml-auto grid size-11 place-items-center rounded-[10px]" aria-label="Notificações">
            <Bell className="h-4 w-4" />
            {naoLidos > 0 ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-lime" /> : null}
          </NavLink>
        </header>
        <div className="no-print hidden items-center justify-end gap-2 px-8 pt-4 lg:flex">
          <NavLink to="/notificacoes" className="relative inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-soft">
            <Bell className="h-4 w-4" />
            Avisos
            {naoLidos > 0 ? <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{naoLidos}</span> : null}
          </NavLink>
        </div>
        {comoFranqueado ? (
          <div className="no-print flex items-center justify-between gap-3 bg-brand px-4 py-2 text-sm font-semibold text-white md:px-8">
            <div className="min-w-0 break-words">
              <span>Visualizando como franqueado · {unidadeSimulada || 'Escolha a unidade'}</span>
              {simulado ? <span className="block text-xs font-medium">{simulado.nome}</span> : null}
            </div>
            <button type="button" onClick={() => { alternar(); navigate('/') }} className="shrink-0 rounded-lg bg-surface px-3 py-1 text-brand-dark">
              Voltar para franqueadora
            </button>
          </div>
        ) : null}
        <main id="conteudo" tabIndex={-1} className="portal-conteudo mx-auto min-w-0 max-w-7xl scroll-mt-16 px-4 py-5 md:px-8 md:py-6 lg:scroll-mt-0">
          <Outlet key={comoFranqueado ? `simulado-${simulado?.uid ?? ''}` : 'conta'} />
        </main>
      </div>
    </div>
  )
}
