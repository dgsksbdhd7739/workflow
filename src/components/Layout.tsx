import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import {
  Archive,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  HardHat,
  HelpCircle,
  Home,
  Info,
  LayoutDashboard,
  ListChecks,
  Lock,
  Map as MapIcon,
  MessageCircle,
  MessageSquare,
  Package,
  Palette,
  Settings,
  Shield,
  Tag,
  User,
  Users,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import type { Rolle } from '../types/database'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end: boolean
  roles?: Rolle[]
  primary?: boolean
  modul?: string
  nurPlattformAdmin?: boolean
  // Nicht in der festen unteren Leiste (Mobil/App) -- dort nur 5 Punkte,
  // stattdessen als Kachel auf dem Dashboard erreichbar.
  nichtInLeiste?: boolean
  children?: NavItem[]
}

// Spiegelt die Sections der Einstellungen-Seite als Baum: die ersten fuenf
// sind Sprungmarken innerhalb derselben Seite (Einstellungen.tsx scrollt bei
// Hash-Aenderung selbst dorthin), "Verwaltung" buendelt die Unterseiten, die
// trotz eigener Route (/nutzer, /statusvorlagen, ...) inhaltlich zu diesem
// Zweig gehoeren -- historisch gewachsen, hier aber als echte Baum-Kinder
// gefuehrt, damit die Seitenleiste zeigt, dass man sich innerhalb des
// Einstellungen-Bereichs befindet.
const einstellungenKinder: NavItem[] = [
  { to: '/einstellungen#konto', label: 'Konto', icon: User, end: false },
  { to: '/einstellungen#profil', label: 'Profil & persönliche Einstellungen', icon: User, end: false },
  { to: '/einstellungen#sicherheit', label: 'Sicherheit', icon: Shield, end: false },
  { to: '/einstellungen#datenschutz', label: 'Datenschutz & Hinweise', icon: Lock, end: false },
  { to: '/einstellungen#darstellung', label: 'Darstellung', icon: Palette, end: false },
  {
    to: '/einstellungen#verwaltung',
    label: 'Verwaltung',
    icon: Settings,
    end: false,
    roles: ['admin', 'planer'],
    children: [
      { to: '/nutzer', label: 'Nutzer', icon: Users, end: false, roles: ['admin'] },
      { to: '/statusvorlagen', label: 'Statusvorlagen', icon: Tag, end: false, roles: ['admin', 'planer'] },
      { to: '/material-stamm', label: 'Materialstamm', icon: Package, end: false, roles: ['admin', 'planer'] },
      { to: '/ticket-formulare', label: 'Ticket-Formulare', icon: FileText, end: false, roles: ['admin', 'planer'] },
      {
        to: '/tagesbericht-vorlagen',
        label: 'Tagesbericht-Vorlagen',
        icon: ClipboardList,
        end: false,
        roles: ['admin', 'planer'],
      },
    ],
  },
  { to: '/einstellungen#unternehmen', label: 'Unternehmen', icon: Building2, end: false, roles: ['admin', 'planer'] },
  { to: '/einstellungen#ueber-workflow', label: 'Über WorkFlow', icon: Info, end: false },
]

// Nutzer und Materialstamm sind bewusst nicht in der Hauptleiste gelistet,
// sondern als Kinder von Einstellungen -- so bleibt die Leiste kurz, zeigt
// aber den Strukturbaum, sobald man in diesem Bereich ist.
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
  { to: '/hilfe', label: 'Hilfe', icon: HelpCircle, end: false, nichtInLeiste: true },
  { to: '/einstellungen', label: 'Einstellungen', icon: Settings, end: false, children: einstellungenKinder },
  { to: '/plattform-admin', label: 'Plattform-Verwaltung', icon: Building2, end: false, nurPlattformAdmin: true, nichtInLeiste: true },
]

function projektNav(id: string): NavItem[] {
  return [
    { to: `/projekte/${id}`, label: 'Übersicht', icon: LayoutDashboard, end: true, primary: true },
    { to: `/projekte/${id}/plaene`, label: 'Pläne', icon: MapIcon, end: false, primary: true },
    { to: `/projekte/${id}/dokumente`, label: 'Dokumente', icon: FileText, end: false, modul: 'dokumente' },
    { to: `/projekte/${id}/aufgaben`, label: 'Aufgaben', icon: ListChecks, end: false, primary: true },
    {
      to: `/projekte/${id}/tagesberichte`,
      label: 'Tagesberichte',
      icon: ClipboardList,
      end: false,
      modul: 'tagesberichte',
    },
    { to: `/projekte/${id}/material`, label: 'Material', icon: Package, end: false, modul: 'material' },
    { to: `/projekte/${id}/termine`, label: 'Termine', icon: CalendarDays, end: false, modul: 'termine' },
    {
      to: `/projekte/${id}/zeiterfassung`,
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

function passtZurRolle(item: NavItem, role: Rolle | null, gesperrteModule: Set<string>, istPlattformAdmin: boolean) {
  const rolleOk = !item.roles || (role && item.roles.includes(role))
  const modulOk = !item.modul || !gesperrteModule.has(item.modul)
  const plattformAdminOk = !item.nurPlattformAdmin || istPlattformAdmin
  return rolleOk && modulOk && plattformAdminOk
}

function gefiltert(items: NavItem[], role: Rolle | null, gesperrteModule: Set<string>, istPlattformAdmin: boolean): NavItem[] {
  return items
    .filter((item) => passtZurRolle(item, role, gesperrteModule, istPlattformAdmin))
    .map((item) => (item.children ? { ...item, children: gefiltert(item.children, role, gesperrteModule, istPlattformAdmin) } : item))
}

function pfadOhneQuery(to: string) {
  return to.split('?')[0]
}

// Eigene Aktiv-Erkennung statt NavLinks eingebauter -- die ignoriert bei
// Sprungmarken (/einstellungen#profil) den Hash und wuerde sonst alle
// Einstellungen-Unterpunkte gleichzeitig als aktiv markieren.
function istAktiv(item: NavItem, pathname: string, hash: string): boolean {
  if (item.to.includes('#')) {
    // Einstellungen.tsx zeigt ohne Hash den Standard-Tab "Konto" -- damit
    // der Baum dazu passt, gilt der Konto-Eintrag auch ohne Hash als aktiv.
    if (item.to.endsWith('#konto') && hash === '' && pathname === pfadOhneQuery(item.to)) return true
    return `${pathname}${hash}` === item.to
  }
  const ziel = pfadOhneQuery(item.to)
  return item.end ? pathname === ziel : pathname === ziel || pathname.startsWith(`${ziel}/`)
}

// Ist dieser Knoten oder einer seiner Nachfahren Teil des aktuellen Pfades?
// Steuert, ob seine Unterpunkte ueberhaupt aufgeklappt angezeigt werden --
// der Baum zeigt also immer genau den Zweig, in dem man sich gerade
// befindet, statt alle Ebenen dauerhaft auszuklappen.
function istImAktuellenZweig(item: NavItem, pathname: string, hash: string): boolean {
  if (istAktiv(item, pathname, hash)) return true
  return (item.children ?? []).some((kind) => istImAktuellenZweig(kind, pathname, hash))
}

function NavBaumKnoten({ item, pathname, hash, tiefe }: { item: NavItem; pathname: string; hash: string; tiefe: number }) {
  const aktiv = istAktiv(item, pathname, hash)
  const aufgeklappt = istImAktuellenZweig(item, pathname, hash)
  return (
    <div>
      <NavLink
        to={item.to}
        end={item.end}
        className={`flex items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors ${
          tiefe === 0 ? 'py-2' : 'py-1.5'
        } ${
          aktiv
            ? 'bg-brand-soft text-brand-text shadow-[inset_3px_0_0_0_var(--color-brand)]'
            : 'text-text-muted hover:bg-surface-hover hover:text-text'
        }`}
      >
        <item.icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        {item.label}
      </NavLink>
      {item.children && item.children.length > 0 && aufgeklappt && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
          {item.children.map((kind) => (
            <NavBaumKnoten key={kind.to} item={kind} pathname={pathname} hash={hash} tiefe={tiefe + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Layout() {
  const { user, role, gesperrteModule, istPlattformAdmin } = useAuth()
  const { id } = useParams()
  const { pathname, hash } = useLocation()
  const online = useOnlineStatus()

  const navProjekt = id ? gefiltert(projektNav(id), role, gesperrteModule, istPlattformAdmin) : []
  const navBaum = gefiltert(
    mainNav.map((item) => (item.to === '/' && navProjekt.length > 0 ? { ...item, children: navProjekt } : item)),
    role,
    gesperrteModule,
    istPlattformAdmin,
  )
  const navHaupt = gefiltert(mainNav, role, gesperrteModule, istPlattformAdmin)
  const navUnten = (
    id ? [mainNav[0], ...navProjekt.filter((item) => item.primary)] : navHaupt.filter((item) => !item.nichtInLeiste)
  ).slice(0, 5)

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
          {navBaum.map((item) => (
            <NavBaumKnoten key={item.to} item={item} pathname={pathname} hash={hash} tiefe={0} />
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

      <nav className="fixed bottom-0 left-0 right-0 flex border-t border-border bg-surface md:hidden">
        {navUnten.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
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
