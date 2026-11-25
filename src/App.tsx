// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Carregando } from './components/ui'
import { podeGerirTrilha } from './lib/manuaisTrilha'
import { BACKEND } from './lib/backend'
import { firebaseConfigured } from './lib/firebase'
import { AuthProvider, useAuth } from './lib/auth'
import { useVisao, VisaoProvider } from './lib/visao'
import { PortalProvider } from './lib/portal'
import { AguardandoPage, CadastroPage, CompletarPage, ConfigPendentePage, EntrarPage, NovaSenhaPage, RecuperarPage } from './pages/AuthPages'
import { GestaoUsuariosPage, MinhaEquipePage } from './pages/GestaoAcessos'
import { FranqueadoraPage, UnidadePage } from './pages/Unidades'
import { ChamadosPage } from './pages/Chamados'
import { SenhasPage, SenhasPermissoesPage, SenhasSolicitacoesPage } from './pages/senhas'
import { BibliotecaPage } from './pages/Biblioteca'
import { BuscaPage } from './pages/Busca'
import { CertificadoPage } from './pages/Certificado'
import { DocumentoPage } from './pages/Documento'
import { AtribuicoesPage } from './pages/Atribuicoes'
import { HomePage } from './pages/Home'
import { MeusCertificadosPage } from './pages/MeusCertificados'
import { ControleAcessoPage } from './pages/ControleAcesso'
import { ModuloEmBrevePage, ModulosPage } from './pages/Modulos'
import { ModelosPage } from './pages/Modelos'
import { NotificacoesPage } from './pages/Notificacoes'
import { PerfilPage } from './pages/Perfil'
import { PerguntePage } from './pages/Pergunte'
import { TrilhaManuaisPage } from './pages/manuais/TrilhaManuais'
import { EstudoManualPage } from './pages/manuais/EstudoManual'
import { GestaoTrilhaPage } from './pages/manuais/GestaoTrilha'
import { UniversidadePage } from './pages/universidade/Universidade'
import { CursoPage } from './pages/universidade/Curso'
import { ProvaPage } from './pages/universidade/Prova'
import { ReestudoPage } from './pages/universidade/Reestudo'
import { GestaoUniversidadePage } from './pages/universidade/GestaoUniversidade'
import { MarketingPage } from './pages/marketing/Marketing'
import { CalendarioMarketingPage } from './pages/marketing/Calendario'
import { PedidosMarketingPage } from './pages/marketing/Pedidos'
import { GestaoMarketingPage } from './pages/marketing/GestaoMarketing'
import { ChecklistPage } from './pages/checklist/Checklist'
import { PreencherChecklistPage } from './pages/checklist/Preencher'
import { ExecucaoChecklistPage } from './pages/checklist/Execucao'
import { HistoricoChecklistPage, NaoConformidadesPage } from './pages/checklist/Historico'
import { GestaoChecklistPage } from './pages/checklist/GestaoChecklist'
import { EstoquePage } from './pages/estoque/Estoque'
import { GestaoEstoquePage } from './pages/estoque/GestaoEstoque'
import { CrmPage } from './pages/crm/Crm'
import { LeadPage } from './pages/crm/Lead'
import { GestaoCrmPage } from './pages/crm/GestaoCrm'
import { ClientesPage } from './pages/cliente/Clientes'
import { ClientePage } from './pages/cliente/Cliente'
import { PainelClientePage } from './pages/cliente/PainelPublico'
import { NuvemRedePage, NuvemUnidadePage } from './pages/nuvem/Nuvem'
import { GestaoAuditoriaPage } from './pages/auditoria/GestaoAuditoria'
import { EditorAuditoriaPage } from './pages/auditoria/EditorAuditoria'
import { AuditoriaPage } from './pages/auditoria/Auditoria'
import { MinhasAuditoriasPage } from './pages/auditoria/MinhasAuditorias'
import { VisaoRedePage } from './pages/acompanhamento/VisaoRede'
import { PainelUnidadePage } from './pages/acompanhamento/PainelUnidade'
import { MeuAcompanhamentoPage } from './pages/acompanhamento/MeuAcompanhamento'

const PainelPage = lazy(() => import('./pages/admin/Painel').then((mod) => ({ default: mod.PainelPage })))
const UsuariosPage = lazy(() => import('./pages/admin/Usuarios').then((mod) => ({ default: mod.UsuariosPage })))
const ConformidadePage = lazy(() => import('./pages/admin/Conformidade').then((mod) => ({ default: mod.ConformidadePage })))
const CategoriasPage = lazy(() => import('./pages/admin/Categorias').then((mod) => ({ default: mod.CategoriasPage })))
const ImportarConteudo = lazy(() => import('./pages/admin/ImportarConteudo'))
const DocumentoEditor = lazy(() => import('./pages/admin/DocumentoEditor'))
const TrilhasAdminPage = lazy(() => import('./pages/admin/TrilhasAdmin').then((mod) => ({ default: mod.TrilhasAdminPage })))
const TrilhaEditor = lazy(() => import('./pages/admin/TrilhasAdmin'))

function Admin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { ehAdmin } = useVisao()
  if (user?.papel !== 'admin' || !ehAdmin) return <Navigate to="/" replace />
  return <Suspense fallback={<Carregando />}>{children}</Suspense>
}

function GestorManuais({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { ehAdmin } = useVisao()
  if (!podeGerirTrilha(user, ehAdmin)) return <Navigate to="/" replace />
  return <Suspense fallback={<Carregando />}>{children}</Suspense>
}

function Area() {
  const { status, recuperandoSenha, linkSenhaInvalido } = useAuth()
  if (recuperandoSenha) return <NovaSenhaPage />
  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center">
        <Carregando texto="Abrindo o portal…" />
      </div>
    )
  }
  if (status === 'error' && !linkSenhaInvalido) return <AguardandoPage />
  return (
    <HashRouter>
      <Routes>
        <Route path="/entrar" element={<EntrarPage />} />
        <Route path="/cadastro" element={<CadastroPage />} />
        <Route path="/recuperar" element={<RecuperarPage />} />
        <Route path="/aguardando" element={<AguardandoPage />} />
        <Route path="/completar" element={<CompletarPage />} />
        {/* Link público do locatário (Painel do Cliente): sem login, só lê o painel do token. */}
        <Route path="/painel/:token" element={<PainelClientePage />} />
        <Route
          element={
            status === 'ready' ? (
              <PortalProvider>
                <Layout />
              </PortalProvider>
            ) : (
              <Navigate to={status === 'incomplete' ? '/completar' : status === 'signedOut' ? '/entrar' : '/aguardando'} replace />
            )
          }
        >
          <Route path="/" element={<ModulosPage />} />
          <Route path="/modulos/acesso" element={<ControleAcessoPage />} />
          <Route path="/modulos/:slug" element={<ModuloEmBrevePage />} />
          <Route path="/manuais" element={<HomePage />} />
          <Route path="/manuais/trilha" element={<TrilhaManuaisPage />} />
          <Route path="/manuais/estudo/:documentoId" element={<EstudoManualPage />} />
          <Route path="/manuais/gestao" element={<GestaoTrilhaPage />} />
          <Route path="/atribuicoes" element={<AtribuicoesPage />} />
          <Route path="/modelos" element={<ModelosPage />} />
          <Route path="/biblioteca" element={<BibliotecaPage />} />
          <Route path="/biblioteca/:categoriaId" element={<BibliotecaPage />} />
          <Route path="/documento/:id" element={<DocumentoPage />} />
          <Route path="/documento/:id/imprimir" element={<DocumentoPage />} />
          <Route path="/busca" element={<BuscaPage />} />
          <Route path="/meus-certificados" element={<MeusCertificadosPage />} />
          <Route path="/universidade" element={<UniversidadePage />} />
          <Route path="/universidade/curso/:cursoId" element={<CursoPage />} />
          <Route path="/universidade/curso/:cursoId/prova" element={<ProvaPage />} />
          <Route path="/universidade/curso/:cursoId/reestudo" element={<ReestudoPage />} />
          <Route path="/universidade/gestao" element={<GestaoUniversidadePage />} />
          <Route path="/marketing" element={<MarketingPage />} />
          <Route path="/marketing/calendario" element={<CalendarioMarketingPage />} />
          <Route path="/marketing/pedidos" element={<PedidosMarketingPage />} />
          <Route path="/marketing/gestao" element={<GestaoMarketingPage />} />
          <Route path="/checklist" element={<ChecklistPage />} />
          <Route path="/checklist/preencher/:modeloId" element={<PreencherChecklistPage />} />
          <Route path="/checklist/execucao/:id" element={<ExecucaoChecklistPage />} />
          <Route path="/checklist/historico" element={<HistoricoChecklistPage />} />
          <Route path="/checklist/nao-conformidades" element={<NaoConformidadesPage />} />
          <Route path="/checklist/gestao" element={<GestaoChecklistPage />} />
          <Route path="/estoque" element={<EstoquePage />} />
          <Route path="/estoque/gestao" element={<GestaoEstoquePage />} />
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/crm/lead/:id" element={<LeadPage />} />
          <Route path="/crm/gestao" element={<GestaoCrmPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/clientes/:id" element={<ClientePage />} />
          <Route path="/nuvem" element={<NuvemUnidadePage />} />
          <Route path="/nuvem/rede" element={<NuvemRedePage />} />
          <Route path="/auditoria" element={<GestaoAuditoriaPage />} />
          <Route path="/auditoria/nova" element={<EditorAuditoriaPage />} />
          <Route path="/auditoria/editar/:id" element={<EditorAuditoriaPage />} />
          <Route path="/auditorias" element={<MinhasAuditoriasPage />} />
          <Route path="/auditorias/:id" element={<AuditoriaPage />} />
          <Route path="/acompanhamento" element={<VisaoRedePage />} />
          <Route path="/acompanhamento/unidade/:id" element={<PainelUnidadePage />} />
          <Route path="/meu-acompanhamento" element={<MeuAcompanhamentoPage />} />
          {/* Trilhas e quizzes antigos corrigiam a nota no aparelho: agora tudo passa pela Universidade. */}
          <Route path="/trilhas/*" element={<Navigate to="/universidade" replace />} />
          <Route path="/certificado/:trilhaId" element={<CertificadoPage />} />
          <Route path="/pergunte" element={<PerguntePage />} />
          <Route path="/notificacoes" element={<NotificacoesPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/franqueadora" element={<Admin><FranqueadoraPage /></Admin>} />
          <Route path="/franqueadora/unidade/:id" element={<Admin><UnidadePage /></Admin>} />
          <Route path="/gestao-usuarios" element={<Admin><GestaoUsuariosPage /></Admin>} />
          <Route path="/minha-equipe" element={<MinhaEquipePage />} />
          <Route path="/chamados" element={<ChamadosPage />} />
          <Route path="/senhas" element={<SenhasPage />} />
          <Route path="/senhas/solicitacoes" element={<SenhasSolicitacoesPage />} />
          <Route path="/senhas/permissoes" element={<SenhasPermissoesPage />} />
          <Route path="/admin" element={<Admin><PainelPage /></Admin>} />
          <Route path="/admin/usuarios" element={<Admin><UsuariosPage /></Admin>} />
          <Route path="/admin/conformidade" element={<Admin><ConformidadePage /></Admin>} />
          <Route path="/admin/importar" element={<Admin><ImportarConteudo /></Admin>} />
          <Route path="/admin/categorias" element={<GestorManuais><CategoriasPage /></GestorManuais>} />
          <Route path="/admin/documento/novo" element={<GestorManuais><DocumentoEditor key="novo" /></GestorManuais>} />
          <Route path="/admin/documento/:id" element={<GestorManuais><DocumentoEditor key="edicao" /></GestorManuais>} />
          <Route path="/admin/trilhas" element={<Admin><TrilhasAdminPage /></Admin>} />
          <Route path="/admin/trilhas/nova" element={<Admin><TrilhaEditor /></Admin>} />
          <Route path="/admin/trilhas/:id" element={<Admin><TrilhaEditor /></Admin>} />
        </Route>
        <Route path="*" element={<Navigate to={status === 'ready' ? '/' : '/entrar'} replace />} />
      </Routes>
    </HashRouter>
  )
}

export function App() {
  if (BACKEND === 'firebase' && !firebaseConfigured) return <ConfigPendentePage />
  return (
    <AuthProvider>
      <VisaoProvider>
        <Area />
      </VisaoProvider>
    </AuthProvider>
  )
}
