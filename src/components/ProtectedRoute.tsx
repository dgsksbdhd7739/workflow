import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ProtectedRoute() {
  const { user, loading, mussPasswortAendern } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-text-muted">
        Lädt…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (mussPasswortAendern && location.pathname !== '/passwort-aendern') {
    return <Navigate to="/passwort-aendern" replace />
  }

  return <Outlet />
}
