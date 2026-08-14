import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Maengel } from './pages/Maengel'
import { Plaene } from './pages/Plaene'
import { PlanDetail } from './pages/PlanDetail'
import { Tagesberichte } from './pages/Tagesberichte'
import { Zeiterfassung } from './pages/Zeiterfassung'
import { Kalkulation } from './pages/Kalkulation'
import { Termine } from './pages/Termine'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/baustellen/:id/maengel" element={<Maengel />} />
              <Route path="/baustellen/:id/plaene" element={<Plaene />} />
              <Route path="/baustellen/:id/plaene/:planId" element={<PlanDetail />} />
              <Route path="/baustellen/:id/tagesberichte" element={<Tagesberichte />} />
              <Route path="/baustellen/:id/zeiterfassung" element={<Zeiterfassung />} />
              <Route path="/baustellen/:id/kalkulation" element={<Kalkulation />} />
              <Route path="/baustellen/:id/termine" element={<Termine />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
