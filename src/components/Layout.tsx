import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const mainNav = [{ to: '/', label: 'Baustellen', icon: '🏗️' }]

function baustelleNav(id: string) {
  return [
    { to: `/baustellen/${id}/maengel`, label: 'Mängel', icon: '⚠️' },
    { to: `/baustellen/${id}/plaene`, label: 'Pläne', icon: '🗺️' },
    { to: `/baustellen/${id}/tagesberichte`, label: 'Tagesberichte', icon: '📋' },
    { to: `/baustellen/${id}/zeiterfassung`, label: 'Zeiterfassung', icon: '⏱️' },
  ]
}

export function Layout() {
  const { signOut, user } = useAuth()
  const { id } = useParams()
  const nav = id ? [...mainNav, ...baustelleNav(id)] : mainNav

  return (
    <div className="flex h-screen flex-col md:flex-row bg-gray-50">
      <aside className="hidden md:flex md:w-60 md:flex-col border-r border-gray-200 bg-white">
        <div className="px-4 py-4 text-lg font-semibold text-gray-900">Baustellenapp</div>
        <nav className="flex-1 space-y-1 px-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-3">
          <div className="mb-2 truncate text-xs text-gray-500">{user?.email}</div>
          <button
            onClick={() => signOut()}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Abmelden
          </button>
        </div>
      </aside>

      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
        <span className="text-lg font-semibold text-gray-900">Baustellenapp</span>
        <button onClick={() => signOut()} className="text-sm text-gray-600">
          Abmelden
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex border-t border-gray-200 bg-white md:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
                isActive ? 'text-blue-700' : 'text-gray-500'
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
