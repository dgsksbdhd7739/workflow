import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { initPushNotifications } from './lib/push'
import { ChangelogDialog } from './components/ChangelogDialog'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { ProjektDashboard } from './pages/ProjektDashboard'
import { Maengel } from './pages/Maengel'
import { Material } from './pages/Material'
import { Plaene } from './pages/Plaene'
import { PlanDetail } from './pages/PlanDetail'
import { Tagesberichte } from './pages/Tagesberichte'
import { Zeiterfassung } from './pages/Zeiterfassung'
import { Termine } from './pages/Termine'
import { StatusVorlagen } from './pages/StatusVorlagen'
import { Nutzerverwaltung } from './pages/Nutzerverwaltung'
import { PasswortAendern } from './pages/PasswortAendern'
import { Einstellungen } from './pages/Einstellungen'
import { Archiv } from './pages/Archiv'
import { Gruppenchat } from './pages/Gruppenchat'
import { ProjektChat } from './pages/ProjektChat'
import { Dokumente } from './pages/Dokumente'
import { MaterialStamm } from './pages/MaterialStamm'

function PushBootstrap() {
  const { user } = useAuth()
  useEffect(() => {
    if (user) initPushNotifications(user.id)
  }, [user])
  return null
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PushBootstrap />
        <ChangelogDialog />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/passwort-aendern" element={<PasswortAendern />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/archiv" element={<Archiv />} />
              <Route path="/einstellungen" element={<Einstellungen />} />
              <Route path="/statusvorlagen" element={<StatusVorlagen />} />
              <Route path="/nutzer" element={<Nutzerverwaltung />} />
              <Route path="/team-chat" element={<Gruppenchat />} />
              <Route path="/projekt-chat" element={<ProjektChat />} />
              <Route path="/material-stamm" element={<MaterialStamm />} />
              <Route path="/baustellen/:id" element={<ProjektDashboard />} />
              <Route path="/baustellen/:id/maengel" element={<Maengel />} />
              <Route path="/baustellen/:id/material" element={<Material />} />
              <Route path="/baustellen/:id/plaene" element={<Plaene />} />
              <Route path="/baustellen/:id/plaene/:planId" element={<PlanDetail />} />
              <Route path="/baustellen/:id/dokumente" element={<Dokumente />} />
              <Route path="/baustellen/:id/tagesberichte" element={<Tagesberichte />} />
              <Route path="/baustellen/:id/zeiterfassung" element={<Zeiterfassung />} />
              <Route path="/baustellen/:id/termine" element={<Termine />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
