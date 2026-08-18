import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import {
  Archive,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  HardHat,
  Home,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  MessageCircle,
  MessageSquare,
  Package,
  Settings,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import type { Rolle } from '../types/database'

type NavItem = { to: string; label: string; icon: LucideIcon; end: boolean; roles?: Rolle[]; primary?: boolean }

// Nutzer und Materialstamm sind bewusst nicht hier gelistet -- erreichbar
// nur ueber Einstellungen, damit die Leiste kurz und aufgeraeumt bleibt.
const mainNav: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  {
    to: '/team-chat',
    label: 'Team-Chat',
    icon: MessageSquare,
    end: false,
    roles: ['admin', 'planer', 'techniker'],
  },
  {
    to: '/projekt-chat',
    label: 'Projekt-Chat',
    icon: MessageCircle,
    end: false,
    roles: ['admin', 'planer', 'techniker'],
  },
  { to: '/archiv', label: 'Archiv', icon: Archive, end: false, roles: ['admin', 'planer'] },
  { to: '/einstellungen', label: 'Einstellungen', icon: Settings, end: false },
]

function baustelleNav(id: string): NavItem[] {
  return [
    { to: `/baustellen/${id}`, label: 'Übersicht', icon: LayoutDashboard, end: true, primary: true },
    { to: `/baustellen/${id}/plaene`, label: 'Pläne', icon: MapIcon, end: false, primary: true },
    { to: `/baustellen/${id}/dokumente`, label: 'Dokumente', icon: FileText, end: false },
    { to: `/baustellen/${id}/maengel`, label: 'Aufgaben', icon: ListChecks, end: false, primary: true },
    { to: `/baustellen/${id}/tagesberichte`, label: 'Tagesberichte', icon: ClipboardList, end: false },
    { to: `/baustellen/${id}/material`, label: 'Material', icon: Package, end: false },
    { to: `/baustellen/${id}/termine`, label: 'Termine', icon: CalendarDays, end: false },
    {
      to: `/baustellen/${id}/zeiterfassung`,
      label: 'Zeiterfassung',
      icon: Clock,
      end: false,
      roles: ['admin', 'planer', 'techniker'],
    },
    {
      to: `/projekt-chat?projekt=${id}`,
      label: 'Projekt-Chat',
      icon: MessageCircle,
      end: false,
      roles: ['admin', 'planer', 'techniker'],
      primary: true,
    },
  ]
}

function passtZurRolle(item: NavItem, role: Rolle | null) {
  return !item.roles || (role && item.roles.includes(role))
}

export function Layout() {
  const { user, role } = useAuth()
  const { id } = useParams()
  const online = useOnlineStatus()

  const navHaupt = mainNav.filter((item) => passtZurRolle(item, role))
  const navProjekt = id ? baustelleNav(id).filter((item) => passtZurRolle(item, role)) : []
  const navUnten = id ? [mainNav[0], ...navProjekt.filter((item) => item.primary)] : navHaupt

  return (
    <div className="flex h-screen flex-col bg-bg md:flex-row">
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border bg-surface">
        <Link to="/" className="flex items-center gap-2.5 px-5 py-5">
          <div className="logo-tile h-8 w-8 shrink-0">
            <HardHat className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <span className="text-lg font-extrabold tracking-tight text-text">
            Work<span className="brand-text">Flow</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {navHaupt.map((item) => (
            <div key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-soft text-brand-text shadow-[inset_3px_0_0_0_var(--color-brand)]'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text'
                  }`
                }
              >
                <item.icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                {item.label}
              </NavLink>
              {item.to === '/' && navProjekt.length > 0 && (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
                  {navProjekt.map((sub) => (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      end={sub.end}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          isActive ? 'bg-brand-soft text-brand-text' : 'text-text-muted hover:bg-surface-hover hover:text-text'
                        }`
                      }
                    >
                      <sub.icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                      {sub.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="truncate px-1 text-xs text-text-subtle">{user?.email}</div>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-text">
          <div className="logo-tile h-7 w-7 shrink-0">
            <HardHat className="h-3.5 w-3.5" strokeWidth={2.25} />
          </div>
          Work<span className="brand-text">Flow</span>
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        {!online && (
          <div className="flex items-center justify-center gap-1.5 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <WifiOff className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
            Offline — zuletzt geladene Daten werden angezeigt, Änderungen können erst nach Verbindung gespeichert werden.
          </div>
        )}
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex overflow-x-auto border-t border-border bg-surface md:hidden">
        {navUnten.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-w-16 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive ? 'text-brand' : 'text-text-subtle'
              }`
            }
          >
            <item.icon className="h-5 w-5" strokeWidth={2.25} />
            <span className="truncate px-0.5">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
