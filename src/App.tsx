import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Carregando } from './components/ui'
import { firebaseConfigured } from './lib/firebase'
import { AuthProvider, useAuth } from './lib/auth'
import { useVisao, VisaoProvider } from './lib/visao'
import { PortalProvider } from './lib/portal'
import { AguardandoPage, CadastroPage, CompletarPage, ConfigPendentePage, EntrarPage, RecuperarPage } from './pages/AuthPages'
import { FranqueadoraPage, GestaoUsuariosPage, MinhaEquipePage } from './pages/GestaoAcessos'
import { ChamadosPage } from './pages/Chamados'
import { BibliotecaPage } from './pages/Biblioteca'
import { BuscaPage } from './pages/Busca'
import { CertificadoPage } from './pages/Certificado'
import { DocumentoPage } from './pages/Documento'
import { AtribuicoesPage } from './pages/Atribuicoes'
import { HomePage } from './pages/Home'
import { MeusCertificadosPage } from './pages/MeusCertificados'
import { ModuloEmBrevePage, ModulosPage } from './pages/Modulos'
import { ModelosPage } from './pages/Modelos'
import { NotificacoesPage } from './pages/Notificacoes'
import { PerfilPage } from './pages/Perfil'
import { PerguntePage } from './pages/Pergunte'
import { QuizPage } from './pages/Quiz'
import { TrilhaPage, TrilhasPage } from './pages/Trilhas'

const PainelPage = lazy(() => import('./pages/admin/Painel').then((mod) => ({ default: mod.PainelPage })))
const UsuariosPage = lazy(() => import('./pages/admin/Usuarios').then((mod) => ({ default: mod.UsuariosPage })))
const ConformidadePage = lazy(() => import('./pages/admin/Conformidade').then((mod) => ({ default: mod.ConformidadePage })))
const CategoriasPage = lazy(() => import('./pages/admin/Categorias').then((mod) => ({ default: mod.CategoriasPage })))
const DocumentoEditor = lazy(() => import('./pages/admin/DocumentoEditor'))
const TrilhasAdminPage = lazy(() => import('./pages/admin/TrilhasAdmin').then((mod) => ({ default: mod.TrilhasAdminPage })))
const TrilhaEditor = lazy(() => import('./pages/admin/TrilhasAdmin'))

function Admin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { ehAdmin } = useVisao()
  if (user?.papel !== 'admin' || !ehAdmin) return <Navigate to="/" replace />
  return <Suspense fallback={<Carregando />}>{children}</Suspense>
}

function Area() {
  const { status } = useAuth()
  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center">
        <Carregando texto="Abrindo o portal…" />
      </div>
    )
  }
  if (status === 'error') return <AguardandoPage />
  return (
    <HashRouter>
      <Routes>
        <Route path="/entrar" element={<EntrarPage />} />
        <Route path="/cadastro" element={<CadastroPage />} />
        <Route path="/recuperar" element={<RecuperarPage />} />
        <Route path="/aguardando" element={<AguardandoPage />} />
        <Route path="/completar" element={<CompletarPage />} />
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
          <Route path="/modulos/:slug" element={<ModuloEmBrevePage />} />
          <Route path="/manuais" element={<HomePage />} />
          <Route path="/atribuicoes" element={<AtribuicoesPage />} />
          <Route path="/modelos" element={<ModelosPage />} />
          <Route path="/biblioteca" element={<BibliotecaPage />} />
          <Route path="/biblioteca/:categoriaId" element={<BibliotecaPage />} />
          <Route path="/documento/:id" element={<DocumentoPage />} />
          <Route path="/documento/:id/imprimir" element={<DocumentoPage />} />
          <Route path="/busca" element={<BuscaPage />} />
          <Route path="/meus-certificados" element={<MeusCertificadosPage />} />
          <Route path="/trilhas" element={<TrilhasPage />} />
          <Route path="/trilhas/:id" element={<TrilhaPage />} />
          <Route path="/trilhas/:trilhaId/quiz/:quizId" element={<QuizPage />} />
          <Route path="/certificado/:trilhaId" element={<CertificadoPage />} />
          <Route path="/pergunte" element={<PerguntePage />} />
          <Route path="/notificacoes" element={<NotificacoesPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/franqueadora" element={<Admin><FranqueadoraPage /></Admin>} />
          <Route path="/gestao-usuarios" element={<Admin><GestaoUsuariosPage /></Admin>} />
          <Route path="/minha-equipe" element={<MinhaEquipePage />} />
          <Route path="/chamados" element={<ChamadosPage />} />
          <Route path="/admin" element={<Admin><PainelPage /></Admin>} />
          <Route path="/admin/usuarios" element={<Admin><UsuariosPage /></Admin>} />
          <Route path="/admin/conformidade" element={<Admin><ConformidadePage /></Admin>} />
          <Route path="/admin/categorias" element={<Admin><CategoriasPage /></Admin>} />
          <Route path="/admin/documento/novo" element={<Admin><DocumentoEditor /></Admin>} />
          <Route path="/admin/documento/:id" element={<Admin><DocumentoEditor /></Admin>} />
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
  if (!firebaseConfigured) return <ConfigPendentePage />
  return (
    <AuthProvider>
      <VisaoProvider>
        <Area />
      </VisaoProvider>
    </AuthProvider>
  )
}
