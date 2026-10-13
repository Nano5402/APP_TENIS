import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu } from 'lucide-react'
import ActionDialog from '../common/ActionDialog'
import { MotionToggle } from '../common/TennisAtmosphere'
import {
  BookOpen,
  Megaphone,
  Gavel,
  Handshake,
  Home,
  LogIn,
  Radio,
  Settings,
  ShieldCheck,
  Star,
  Trophy,
  User,
} from 'lucide-react'
import useAuthStore from '../../store/useAuthStore'
import { cn } from '../../utils/cn'
import ThemeToggle from '../common/ThemeToggle'
import ProfileMenu from './ProfileMenu'
import NotificationBell from '../common/NotificationBell'
import './Header.css'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Inicio', exact: true },
  { to: '/live', icon: Radio, label: 'En vivo', dot: true },
  { to: '/tennis', icon: Trophy, label: 'Tenis' },
  { to: '/sponsors', icon: Handshake, label: 'Patrocinadores' },
  { to: '/anuncios', icon: Megaphone, label: 'Avisos' },
  { to: '/ayuda', icon: BookOpen, label: 'Ayuda' },
  { to: '/favorites', icon: Star, label: 'Favoritos' },
  { to: '/profile', icon: User, label: 'Mi perfil' },
  { to: '/settings', icon: Settings, label: 'Configuración' },
]

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useAuthStore()
  const isAdmin = user?.rol === 'admin'
  const isOfficial = ['admin', 'juez', 'juez_director'].includes(user?.rol)

  return (
    <header className='app-header top-navigation sticky top-0 z-50'>
      <div className='top-navigation-primary'>
        <div className='top-navigation-brands'>
          <Link to='/' aria-label='Ir al inicio del Club Unión'>
            <img
              src='/branding/subcomite-tenis-club-union.png'
              alt='Subcomité de Tenis del Club Unión'
              className='top-navigation-club-logo'
            />
          </Link>
          <span className='top-navigation-brand-divider' aria-hidden='true' />
          <a
            href='https://www.instagram.com/legal.branding'
            target='_blank'
            rel='noreferrer'
            aria-label='Abrir Instagram de Legal Branding'
          >
            <img
              src='/branding/legal-branding.png'
              alt='Legal Branding'
              className='top-navigation-partner-logo'
            />
          </a>
        </div>

        <div className='top-navigation-actions'>
          <ThemeToggle />

          <NotificationBell />

          {user ? (
            <ProfileMenu />
          ) : (
            <Link to='/login' className='top-navigation-login'>
              <LogIn className='w-4 h-4' />
              <span>Ingresar</span>
            </Link>
          )}
          <button
            className='top-navigation-mobile btn-ghost p-2'
            aria-label='Abrir menú de navegación'
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
        </div>
      </div>
      {menuOpen && (
        <ActionDialog title='Explora el club' onClose={() => setMenuOpen(false)}>
          <nav
            className='mobile-navigation-grid'
            aria-label='Navegación móvil'
            onClick={(e) => {
              if (e.target.closest('a')) setMenuOpen(false)
            }}
          >
            <NavigationLinks isAdmin={isAdmin} isOfficial={isOfficial} />
          </nav>
          <MotionToggle />
        </ActionDialog>
      )}
      <nav
        className='top-navigation-links top-navigation-links-organized'
        aria-label='Navegación principal'
      >
        <NavigationLinks isAdmin={isAdmin} isOfficial={isOfficial} />
        <MotionToggle />
      </nav>
    </header>
  )
}

function NavigationLinks({ isAdmin, isOfficial }) {
  const { user } = useAuthStore()
  const isJuez = user?.rol === 'juez'

  let items
  if (isJuez) {
    items = [
      ...NAV_ITEMS.filter((item) => ['/sponsors', '/profile'].includes(item.to)),
      { to: '/ayuda', icon: BookOpen, label: 'Ayuda' },
      { to: '/juez', icon: Gavel, label: 'Juez' },
    ]
  } else if (isOfficial) {
    items = [
      ...NAV_ITEMS,
      { to: '/juez', icon: Gavel, label: 'Juez' },
      ...(isAdmin ? [{ to: '/admin', icon: ShieldCheck, label: 'Administración' }] : []),
    ]
  } else {
    items = NAV_ITEMS
  }

  return items.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.exact}
      className={({ isActive }) => cn('top-navigation-link', isActive && 'active')}
    >
      {({ isActive }) => (
        <>
          <span className='top-navigation-link-icon'>
            <item.icon strokeWidth={isActive ? 2.4 : 1.9} aria-hidden='true' />
            {item.dot && <span className='top-navigation-live-dot' />}
          </span>
          <span>{item.to === '/' && user?.rol === 'miembro' ? 'Mi panel' : item.label}</span>
        </>
      )}
    </NavLink>
  ))
}
