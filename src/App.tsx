import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { initPushNotifications } from './lib/push'
import { ChangelogDialog } from './components/ChangelogDialog'
import { OnboardingDialog } from './components/OnboardingDialog'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Datenschutz } from './pages/Datenschutz'
import { Impressum } from './pages/Impressum'
import { PlattformAdmin } from './pages/PlattformAdmin'
import { Dashboard } from './pages/Dashboard'
import { ProjektDashboard } from './pages/ProjektDashboard'
import { Aufgaben } from './pages/Aufgaben'
import { Material } from './pages/Material'
import { Plaene } from './pages/Plaene'
import { PlanDetail } from './pages/PlanDetail'
import { Tagesberichte } from './pages/Tagesberichte'
import { Zeiterfassung } from './pages/Zeiterfassung'
import { Termine } from './pages/Termine'
import { StatusVorlagen } from './pages/StatusVorlagen'
import { TicketFormulare } from './pages/TicketFormulare'
import { TagesberichtVorlagen } from './pages/TagesberichtVorlagen'
import { Nutzerverwaltung } from './pages/Nutzerverwaltung'
import { PasswortAendern } from './pages/PasswortAendern'
import { AnmeldungBestaetigen } from './pages/AnmeldungBestaetigen'
import { Einstellungen } from './pages/Einstellungen'
import { Archiv } from './pages/Archiv'
import { Gruppenchat } from './pages/Gruppenchat'
import { ProjektChat } from './pages/ProjektChat'
import { Dokumente } from './pages/Dokumente'
import { MaterialStamm } from './pages/MaterialStamm'
import { Hilfe } from './pages/Hilfe'

function PushBootstrap() {
  const { user } = useAuth()
  useEffect(() => {
    if (user) initPushNotifications(user.id)
  }, [user])
  return null
}

function ModalGate() {
  const { user, mussPasswortAendern, mfaPending, onboardingGesehen } = useAuth()
  if (!user || mussPasswortAendern || mfaPending) return null
  return onboardingGesehen ? <ChangelogDialog /> : <OnboardingDialog />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PushBootstrap />
        <ModalGate />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/datenschutz" element={<Datenschutz />} />
          <Route path="/impressum" element={<Impressum />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/passwort-aendern" element={<PasswortAendern />} />
            <Route path="/anmeldung-bestaetigen" element={<AnmeldungBestaetigen />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/archiv" element={<Archiv />} />
              <Route path="/einstellungen" element={<Einstellungen />} />
              <Route path="/hilfe" element={<Hilfe />} />
              <Route path="/statusvorlagen" element={<StatusVorlagen />} />
              <Route path="/ticket-formulare" element={<TicketFormulare />} />
              <Route path="/tagesbericht-vorlagen" element={<TagesberichtVorlagen />} />
              <Route path="/nutzer" element={<Nutzerverwaltung />} />
              <Route path="/plattform-admin" element={<PlattformAdmin />} />
              <Route path="/team-chat" element={<Gruppenchat />} />
              <Route path="/projekt-chat" element={<ProjektChat />} />
              <Route path="/material-stamm" element={<MaterialStamm />} />
              <Route path="/projekte/:id" element={<ProjektDashboard />} />
              <Route path="/projekte/:id/aufgaben" element={<Aufgaben />} />
              <Route path="/projekte/:id/material" element={<Material />} />
              <Route path="/projekte/:id/plaene" element={<Plaene />} />
              <Route path="/projekte/:id/plaene/:planId" element={<PlanDetail />} />
              <Route path="/projekte/:id/dokumente" element={<Dokumente />} />
              <Route path="/projekte/:id/tagesberichte" element={<Tagesberichte />} />
              <Route path="/projekte/:id/zeiterfassung" element={<Zeiterfassung />} />
              <Route path="/projekte/:id/termine" element={<Termine />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
