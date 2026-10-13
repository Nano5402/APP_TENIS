import ActionDialog from '../components/common/ActionDialog'
import './CompactNav.css'
import { Suspense, useState } from 'react'
import { LogOut, Menu } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import ContentLoader from '../components/ui/ContentLoader'
import ToastContainer from '../components/ui/Toast'
import ThemeToggle from '../components/common/ThemeToggle'
import NotificationBell from '../components/common/NotificationBell'
import useAuthStore from '../store/useAuthStore'
import { authService } from '../services/authService'

export default function JudgeLayout() {
  const { user, logout } = useAuthStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scoringActive, setScoringActive] = useState(false)
  const [showGeneralControls, setShowGeneralControls] = useState(false)
  const focused = scoringActive && !showGeneralControls
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const officialNav = (
    <nav aria-label='Navegación oficial' className='flex flex-wrap items-center gap-1'>
      <NavLink to='/mi-actividad' className='btn-secondary text-xs px-3 py-2'>Mi actividad</NavLink>
      <NavLink to='/juez/caddies' className='btn-ghost text-xs px-2 py-2'>Caddies</NavLink>
      {['admin', 'juez_director'].includes(user?.rol) && (
        <NavLink
          to='/director'
          className={({ isActive }) =>
            `btn-ghost text-xs px-2 py-2 ${isActive ? 'font-bold underline' : ''}`
          }
        >
          Director
        </NavLink>
      )}
      <NavLink
        to='/juez'
        end
        className={({ isActive }) =>
          `btn-ghost text-xs px-2 py-2 ${isActive ? 'font-bold underline' : ''}`
        }
      >
        Mesa de juez
      </NavLink>
      <NavLink
        to='/ayuda'
        className={({ isActive }) =>
          `btn-ghost text-xs px-2 py-2 ${isActive ? 'font-bold underline' : ''}`
        }
      >
        Ayuda
      </NavLink>
      <NavLink to='/soporte' className='btn-ghost text-xs px-2 py-2'>
        Soporte
      </NavLink>
      <NavLink
        to='/juez/perfil'
        className={({ isActive }) =>
          `btn-ghost text-xs px-2 py-2 ${isActive ? 'font-bold underline' : ''}`
        }
      >
        Mi perfil
      </NavLink>
    </nav>
  )
  const navigate = useNavigate()
  // A temporary courtside network loss must not log the judge out. The scoring
  // session handles reconnection; real 401 responses still expire the session.

  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    setSignOutError('')
    setMenuOpen(false)
    try {
      if (await authService.logoutSafely()) {
        logout()
        navigate('/login', { replace: true })
      }
    } catch {
      setSignOutError('No se pudo cerrar la sesión. Tus marcaciones locales se conservan; vuelve a intentarlo con conexión.')
    } finally { setSigningOut(false) }
  }

  return (
    <div className='min-h-screen flex flex-col' style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header
        className='app-header sticky top-0 z-40 min-h-14 px-2 sm:px-5 py-1 flex flex-wrap items-center gap-1'
        style={{ backgroundColor: 'var(--bg-sidebar)' }}
      >
        <Link
          to={['admin', 'juez_director'].includes(user?.rol) ? '/director' : '/juez'}
          className='flex items-center gap-2 min-w-0'
        >
          <img
            src='/branding/subcomite-tenis-club-union.png'
            alt='Subcomité de Tenis Club Unión'
            className='w-10 h-10 object-contain shrink-0'
          />
          <span className='min-w-0 hidden sm:block'>
            <span className='flex items-center gap-1.5'>
              <strong
                className='block text-sm leading-tight'
                style={{ color: 'var(--text-primary)' }}
              >
                {user?.rol === 'juez_director' ? 'Juez Director' : 'Control de cancha'}
              </strong>
              {user?.rol === 'juez_director' && (
                <span
                  className='text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider'
                  style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)', color: 'var(--color-brand)' }}
                >
                  Director
                </span>
              )}
            </span>
            <span className='block text-[11px] truncate' style={{ color: 'var(--text-muted)' }}>
              {user?.nombre} {user?.apellido}
            </span>
          </span>
        </Link>
        <div className='ml-auto flex flex-wrap items-center justify-end gap-1'>
          {!focused && <div className='judge-desktop-nav'>{officialNav}</div>}
          {focused && <span className='text-xs font-semibold px-2'>Marcación activa</span>}
          {scoringActive && showGeneralControls && <button className='btn-ghost text-xs' onClick={() => setShowGeneralControls(false)}>Concentrar mesa</button>}
          <button
            className={`${focused ? '' : 'judge-mobile-nav'} btn-ghost p-2`}
            aria-label='Abrir menú del juez'
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          {menuOpen && (
            <ActionDialog title='Control de cancha' onClose={() => setMenuOpen(false)}>
              <div
                className='judge-menu-links'
                onClick={(e) => {
                  if (e.target.closest('a')) setMenuOpen(false)
                }}
              >
                {officialNav}
                {focused && <div className='flex flex-wrap items-center gap-2 pt-3 border-t'>
                  <button className='btn-ghost text-sm' onClick={() => { setShowGeneralControls(true); setMenuOpen(false) }}>Mostrar controles generales</button>
                  <button className='btn-ghost text-sm' disabled={signingOut} onClick={signOut}>Cerrar sesión</button>
                </div>}
              </div>
            </ActionDialog>
          )}

          {user?.rol === 'admin' && (
            <Link to='/admin' className='btn-ghost text-xs px-3 py-2 hidden sm:flex'>
              Administración
            </Link>
          )}
          {!focused && <ThemeToggle />}
          {!focused && <NotificationBell />}
          {!focused && <button disabled={signingOut} onClick={signOut} className='btn-ghost p-2' aria-label='Cerrar sesión'>
            <LogOut className='w-5 h-5' />
          </button>}
        </div>
      </header>

      <main className='flex-1 w-full max-w-5xl mx-auto px-3 sm:px-6 py-2 sm:py-4'>
        {signOutError && <p role='alert' className='text-sm text-red-600 mb-2'>{signOutError}</p>}
        <Suspense fallback={<ContentLoader />}>
          <Outlet context={{ setScoringActive }} />
        </Suspense>
      </main>
      <ToastContainer />
    </div>
  )
}
