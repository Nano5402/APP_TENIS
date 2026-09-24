import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../store/useAuthStore'
import AuthLayout from '../layouts/AuthLayout'
import AppLayout from '../layouts/AppLayout'
import AdminLayout from '../layouts/AdminLayout'
import ProtectedRoute from './ProtectedRoute'
import AdminRoute from './AdminRoute'
import OfficialRoute from './OfficialRoute'
import DirectorRoute from './DirectorRoute'
import JudgeLayout from '../layouts/JudgeLayout'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [pathname])
  return null
}

// ── Auth ──────────────────────────────────────────────────
const Login = lazy(() => import('../pages/auth/Login'))
const Register = lazy(() => import('../pages/auth/Register'))
const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword'))

// ── Director ──────────────────────────────────────────────
const DirectorDashboard = lazy(() => import('../pages/judge/DirectorDashboard'))

// ── App ───────────────────────────────────────────────────
const Home = lazy(() => import('../pages/Home'))
const Anuncios = lazy(() => import('../pages/Anuncios'))
const PlayerDashboard = lazy(() => import('../pages/PlayerDashboard'))
const Live = lazy(() => import('../pages/Live'))
const Tennis = lazy(() => import('../pages/Tennis'))
const TournamentDetail = lazy(() => import('../pages/TournamentDetail'))
const Padel = lazy(() => import('../pages/Padel'))
const Match = lazy(() => import('../pages/Match'))
const Player = lazy(() => import('../pages/Player'))
const Team = lazy(() => import('../pages/Team'))
const Favorites = lazy(() => import('../pages/Favorites'))
const Profile = lazy(() => import('../pages/Profile'))
const Settings = lazy(() => import('../pages/Settings'))
const Sponsors = lazy(() => import('../pages/Sponsors'))
const Pantalla = lazy(() => import('../pages/Pantalla'))
const Ayuda = lazy(() => import('../pages/Ayuda'))
const Support = lazy(() => import('../pages/Support'))

// ── Admin ─────────────────────────────────────────────────
const Dashboard = lazy(() => import('../pages/admin/Dashboard'))
const GestionJugadores = lazy(() => import('../pages/admin/GestionJugadores'))
const GestionEquipos = lazy(() => import('../pages/admin/GestionEquipos'))
const GestionTorneos = lazy(() => import('../pages/admin/GestionTorneos'))
const GestionPartidos = lazy(() => import('../pages/admin/GestionPartidos'))
const GestionAnuncios = lazy(() => import('../pages/admin/GestionAnuncios'))
const GestionSedes = lazy(() => import('../pages/admin/GestionSedes'))
const GestionCategorias = lazy(() => import('../pages/admin/GestionCategorias'))
const GestionUsuarios = lazy(() => import('../pages/admin/GestionUsuarios'))

// ── Juez / control de cancha ──
const JuezPartidos = lazy(() => import('../pages/judge/JuezPartidos'))

// NOTA: no hay <Suspense> aquí a propósito.
// Cada layout (AuthLayout, AppLayout, AdminLayout) tiene su propio
// <Suspense> envolviendo SOLO el <Outlet />, así el Header/Sidebar/Nav
// nunca se desmontan al navegar entre páginas — solo el contenido
// interno muestra un loader pequeño mientras carga el chunk.
export default function AppRouter() {
  const { user, isAuthenticated } = useAuthStore()
  const { pathname } = useLocation()
  // Un juez estándar tiene solo /juez, /juez/perfil y la ayuda
  if (isAuthenticated && user?.rol === 'juez' && !['/juez', '/juez/perfil', '/ayuda', '/soporte'].includes(pathname)) {
    return <Navigate to={pathname === '/profile' ? '/juez/perfil' : '/juez'} replace />
  }
  // Un juez director tiene acceso a su panel dedicado (/director), a la mesa (/juez), a su perfil y a la ayuda
  if (
    isAuthenticated &&
    user?.rol === 'juez_director' &&
    !['/director', '/juez', '/juez/perfil', '/ayuda', '/soporte'].includes(pathname)
  ) {
    return <Navigate to='/director' replace />
  }
  return (
    <>
      <ScrollToTop />
      <Routes>
      {/* Auth */}
      <Route element={<AuthLayout />}>
        <Route path='/login' element={<Login />} />
        <Route path='/register' element={<Register />} />
        <Route path='/forgot-password' element={<ForgotPassword />} />
      </Route>

      <Route path='/pantalla' element={<Suspense fallback={<div className='fixed inset-0 bg-[#07110d]' />}><Pantalla /></Suspense>} />
      <Route element={['juez', 'juez_director'].includes(user?.rol) ? <JudgeLayout /> : <AppLayout />}>
        <Route path='/ayuda' element={<Ayuda />} />
      </Route>

      {/* Consulta pública de marcadores */}
      <Route element={<AppLayout />}>
        <Route path='/' element={isAuthenticated && user?.rol === 'miembro' ? <PlayerDashboard key={user.id} /> : <Home />} />
        <Route path='/live' element={<Live />} />
        <Route path='/anuncios' element={<Anuncios />} />
        <Route path='/tennis' element={<Tennis />} />
        <Route path='/torneo/:id' element={<TournamentDetail />} />
        <Route path='/sponsors' element={<Sponsors />} />
        <Route path='/padel' element={<Padel />} />
        <Route path='/match/:id' element={<Match />} />
        <Route path='/player/:id' element={<Player />} />
        <Route path='/team/:id' element={<Team />} />
        <Route
          path='/favorites'
          element={
            <ProtectedRoute>
              <Favorites />
            </ProtectedRoute>
          }
        />
        <Route
          path='/profile'
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path='/settings'
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Juez Director: panel dedicado de supervisión */}
      <Route
        element={
          <ProtectedRoute>
            <DirectorRoute>
              <JudgeLayout />
            </DirectorRoute>
          </ProtectedRoute>
        }
      >
        <Route path='/director' element={<DirectorDashboard />} />
      </Route>

      {/* Control de cancha y mesa de juez */}
      <Route
        element={
          <ProtectedRoute>
            <OfficialRoute>
              <JudgeLayout />
            </OfficialRoute>
          </ProtectedRoute>
        }
      >
        <Route path='/juez' element={<JuezPartidos />} />
        <Route path='/soporte' element={<Support />} />
        <Route path='/juez/perfil' element={<Profile />} />
        <Route path='/juez/partido/:id' element={<Navigate to='/juez' replace />} />
      </Route>

      {/* Admin (solo rol admin) */}
      <Route
        element={
          <ProtectedRoute>
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          </ProtectedRoute>
        }
      >
        <Route path='/admin' element={<Dashboard />} />
        <Route path='/admin/jugadores' element={<GestionJugadores />} />
        <Route path='/admin/equipos' element={<GestionEquipos />} />
        <Route path='/admin/torneos' element={<GestionTorneos />} />
        <Route path='/admin/partidos' element={<GestionPartidos />} />
        <Route path='/admin/anuncios' element={<GestionAnuncios />} />
        <Route path='/admin/tickets' element={<Support />} />
        <Route path='/admin/sedes' element={<GestionSedes />} />
        <Route path='/admin/categorias' element={<GestionCategorias />} />
        <Route path='/admin/usuarios' element={<GestionUsuarios />} />
      </Route>

      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
    </>
  )
}
