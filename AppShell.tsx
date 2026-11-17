import { useEffect, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  Users,
  X,
} from 'lucide-react'
import { initials, signOut } from '../js/session'
import { isSupabaseConfigured } from '../services/data'
import type { Profile } from '../services/types'
import { ToastStack } from './ui'

export interface NavItem {
  href: string
  label: string
  icon: ReactNode
  badge?: number
  mobileLabel?: string
  mobile?: boolean
}

const currentPage = (): string => {
  const file = window.location.pathname.split('/').pop() || 'index.html'
  return file.replace('.html', '') || 'index'
}

export const navFor = (role: Profile['role'], pendingCount = 0): NavItem[] => {
  if (role === 'encargado') {
    return [
      { href: '/panel.html', label: 'Panel', icon: <LayoutDashboard />, mobile: true },
      { href: '/calendario.html', label: 'Calendario', icon: <CalendarDays />, mobile: true },
      {
        href: '/solicitudes.html',
        label: 'Solicitudes',
        icon: <ClipboardList />,
        badge: pendingCount,
        mobile: true,
      },
      { href: '/recursos.html', label: 'Recursos', icon: <DoorOpen />, mobile: true },
      { href: '/entregas.html', label: 'Entregas', icon: <PackageCheck />, mobile: true },
      { href: '/historial.html', label: 'Historial', icon: <History /> },
      { href: '/usuarios.html', label: 'Cuentas', icon: <Users /> },
    ]
  }
  return [
    { href: '/panel.html', label: 'Inicio', icon: <LayoutDashboard />, mobile: true },
    { href: '/calendario.html', label: 'Calendario', icon: <CalendarDays />, mobile: true },
    { href: '/nueva-solicitud.html', label: 'Nueva solicitud', icon: <Plus />, mobile: true },
    { href: '/solicitudes.html', label: 'Mis reservas', icon: <ClipboardList />, mobile: true },
    { href: '/recursos.html', label: 'Espacios y recursos', icon: <DoorOpen /> },
    { href: '/historial.html', label: 'Mi historial', icon: <History /> },
  ]
}

const ROLE_LABEL: Record<Profile['role'], string> = {
  encargado: 'Encargado de sistemas e innovación tecnológica',
  profesor: 'Profesor',
}

function DemoBanner() {
  if (isSupabaseConfigured) return null
  return (
    <div className="demo-banner" role="status">
      <AlertTriangle size={15} style={{ flex: '0 0 15px' }} />
      <span>
        <strong>Modo demostración:</strong> no hay credenciales de Supabase en <code>.env</code>. Los datos
        viven en el navegador y se reinician con los de ejemplo. Configura{' '}
        <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> para usar la base de datos real.
      </span>
    </div>
  )
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="sidebar-brand">
      <img src="/assets/logos/logo-iuc.svg" alt="" aria-hidden="true" />
      {!compact && (
        <div className="sidebar-brand-text">
          Instituto
          <br />
          Universitario
          <br />
          de Caldas
        </div>
      )}
    </div>
  )
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const page = currentPage()
  return (
    <ul className="nav-list">
      {items.map((item) => {
        const key = item.href.replace('.html', '').replace('/', '')
        const active = key === page
        return (
          <li key={item.href}>
            <a
              className="nav-link"
              href={item.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge > 99 ? '99+' : item.badge}</span> : null}
            </a>
          </li>
        )
      })}
    </ul>
  )
}

interface AppShellProps {
  profile: Profile
  title: string
  subtitle?: string
  actions?: ReactNode
  pendingCount?: number
  children: ReactNode
}

export function AppShell({ profile, title, subtitle, actions, pendingCount = 0, children }: AppShellProps) {
  const [drawer, setDrawer] = useState(false)
  const items = navFor(profile.role, pendingCount)
  const mobileItems = items.filter((i) => i.mobile).slice(0, 4)
  const page = currentPage()

  useEffect(() => {
    document.title = `${title} · Sistema de Reservas IUC`
  }, [title])

  const userBlock = (
    <div className="sidebar-user">
      <span className="avatar">{initials(profile.full_name)}</span>
      <div className="sidebar-user-info">
        <div className="sidebar-user-name">{profile.full_name}</div>
        <div className="sidebar-user-role">{ROLE_LABEL[profile.role]}</div>
      </div>
      <button className="sidebar-signout" onClick={signOut} title="Cerrar sesión" aria-label="Cerrar sesión">
        <LogOut size={16} />
      </button>
    </div>
  )

  return (
    <>
      <DemoBanner />
      <div className="app-shell">
        <aside className="sidebar" aria-label="Navegación principal">
          <Brand />
          <div className="sidebar-role">
            {profile.role === 'encargado' ? 'Encargado de sistemas' : 'Profesor'}
          </div>
          <NavLinks items={items} />
          {userBlock}
        </aside>

        <div className="main-area">
          <header className="mobile-header">
            <button
              className="mobile-icon-btn"
              onClick={() => setDrawer(true)}
              aria-label="Abrir menú"
              aria-expanded={drawer}
            >
              <Menu size={20} />
            </button>
            <span className="mobile-header-title">{title}</span>
            <span className="avatar" aria-hidden="true">
              {initials(profile.full_name)}
            </span>
          </header>

          <div className="topbar">
            <div>
              <h1>{title}</h1>
              {subtitle && (
                <p className="text-sm text-muted" style={{ marginTop: 2 }}>
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="topbar-actions">{actions}</div>}
          </div>

          <main className="page-content" id="contenido">
            {children}
          </main>
        </div>

        <nav className="mobile-nav" aria-label="Navegación inferior">
          {mobileItems.map((item) => {
            const key = item.href.replace('.html', '').replace('/', '')
            return (
              <a key={item.href} href={item.href} aria-current={key === page ? 'page' : undefined}>
                {item.icon}
                <span>{item.mobileLabel ?? item.label}</span>
              </a>
            )
          })}
          <a href={profile.role === 'encargado' ? '/historial.html' : '/solicitudes.html'}>
            <ClipboardList />
            <span>Más</span>
          </a>
        </nav>
      </div>

      {drawer && (
        <>
          <div className="drawer-scrim" onClick={() => setDrawer(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Menú de navegación">
            <div className="flex justify-between items-center mb-12">
              <span style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: 15 }}>
                Menú
              </span>
              <button
                className="mobile-icon-btn"
                onClick={() => setDrawer(false)}
                aria-label="Cerrar menú"
              >
                <X size={18} />
              </button>
            </div>
            <div className="sidebar-role" style={{ padding: '0 8px 10px' }}>
              {profile.role === 'encargado' ? 'Encargado de sistemas' : 'Profesor'}
            </div>
            <NavLinks items={items} onNavigate={() => setDrawer(false)} />
            <div className="mt-16" style={{ borderTop: '1px solid rgba(255,255,255,.14)', paddingTop: 14 }}>
              <div className="flex items-center gap-10">
                <span className="avatar">{initials(profile.full_name)}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="sidebar-user-name">{profile.full_name}</div>
                  <div className="sidebar-user-role">{profile.email}</div>
                </div>
              </div>
              <button className="btn btn-secondary btn-block mt-12" onClick={signOut}>
                <LogOut size={15} /> Cerrar sesión
              </button>
            </div>
          </div>
        </>
      )}
      <ToastStack />
    </>
  )
}

/** Cabecera de marca para páginas sin shell (login / recuperación). */
export function InstitutionalMark() {
  return (
    <div className="flex items-center gap-10">
      <img src="/assets/logos/logo-iuc-light.svg" alt="Instituto Universitario de Caldas" width={40} height={40} />
      <div>
        <div style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: 15 }}>Instituto Universitario de Caldas</div>
        <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 12 }}>Gestión de espacios y recursos tecnológicos</div>
      </div>
    </div>
  )
}

export { Building2 }
