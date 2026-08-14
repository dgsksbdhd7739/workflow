import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useTheme } from '../hooks/useTheme'
import type { Rolle } from '../types/database'

type NavItem = { to: string; label: string; icon: string; end: boolean; roles?: Rolle[] }

const mainNav: NavItem[] = [
  { to: '/', label: 'Projekte', icon: '🏗️', end: true },
  { to: '/statusvorlagen', label: 'Statusvorlagen', icon: '🏷️', end: false, roles: ['admin', 'planer'] },
  { to: '/nutzer', label: 'Nutzer', icon: '👤', end: false, roles: ['admin'] },
]

function baustelleNav(id: string): NavItem[] {
  return [
    { to: `/baustellen/${id}`, label: 'Übersicht', icon: '📊', end: true },
    { to: `/baustellen/${id}/termine`, label: 'Termine', icon: '📅', end: false },
    { to: `/baustellen/${id}/maengel`, label: 'Mängel', icon: '⚠️', end: false },
    { to: `/baustellen/${id}/plaene`, label: 'Pläne', icon: '🗺️', end: false },
    { to: `/baustellen/${id}/tagesberichte`, label: 'Tagesberichte', icon: '📋', end: false },
    {
      to: `/baustellen/${id}/zeiterfassung`,
      label: 'Zeiterfassung',
      icon: '⏱️',
      end: false,
      roles: ['admin', 'planer', 'techniker'],
    },
    { to: `/baustellen/${id}/kalkulation`, label: 'Kalkulation', icon: '💶', end: false, roles: ['admin', 'planer'] },
  ]
}

function ThemeToggle({ theme, onToggle, className }: { theme: string; onToggle: () => void; className?: string }) {
  return (
    <button
      onClick={onToggle}
      aria-label="Farbschema wechseln"
      className={`flex items-center justify-center rounded-lg border border-border-strong text-text-muted transition-colors hover:bg-surface-hover ${className ?? ''}`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}

export function Layout() {
  const { signOut, user, role } = useAuth()
  const { id } = useParams()
  const alleItems = id ? [...mainNav, ...baustelleNav(id)] : mainNav
  const nav = alleItems.filter((item) => !item.roles || (role && item.roles.includes(role)))
  const online = useOnlineStatus()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex h-screen flex-col bg-bg md:flex-row">
      <aside className="hidden md:flex md:w-60 md:flex-col border-r border-border bg-surface">
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold text-text">
            Baustellen<span className="text-brand">app</span>
          </span>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-soft text-brand-text' : 'text-text-muted hover:bg-surface-hover'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-xs text-text-subtle">{user?.email}</div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} className="h-7 w-7 flex-shrink-0 text-sm" />
          </div>
          <Link to="/passwort-aendern" className="btn-secondary mb-2 w-full">
            Passwort ändern
          </Link>
          <button onClick={() => signOut()} className="btn-secondary w-full">
            Abmelden
          </button>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <span className="text-lg font-semibold text-text">
          Baustellen<span className="text-brand">app</span>
        </span>
        <div className="flex items-center gap-3">
          <ThemeToggle theme={theme} onToggle={toggleTheme} className="h-8 w-8 text-sm" />
          <Link to="/passwort-aendern" className="text-sm text-text-muted">
            Passwort
          </Link>
          <button onClick={() => signOut()} className="text-sm text-text-muted">
            Abmelden
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {!online && (
          <div className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Offline — zuletzt geladene Daten werden angezeigt, Änderungen können erst nach Verbindung gespeichert werden.
          </div>
        )}
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex border-t border-border bg-surface md:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                isActive ? 'text-brand' : 'text-text-subtle'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
