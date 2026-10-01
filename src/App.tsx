import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { PaketRoute } from './components/PaketSperre'
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
import { FirmendatenEinrichten } from './pages/FirmendatenEinrichten'
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
  const { user, mussPasswortAendern, mfaPending, onboardingGesehen, firmendatenFehlen } = useAuth()
  if (!user || mussPasswortAendern || mfaPending || firmendatenFehlen) return null
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
            <Route path="/firmendaten-einrichten" element={<FirmendatenEinrichten />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/archiv" element={<Archiv />} />
              <Route path="/einstellungen" element={<Einstellungen />} />
              <Route path="/hilfe" element={<Hilfe />} />
              <Route path="/statusvorlagen" element={<PaketRoute funktion="vorlagen"><StatusVorlagen /></PaketRoute>} />
              <Route path="/ticket-formulare" element={<PaketRoute funktion="vorlagen"><TicketFormulare /></PaketRoute>} />
              <Route path="/tagesbericht-vorlagen" element={<PaketRoute funktion="vorlagen"><TagesberichtVorlagen /></PaketRoute>} />
              <Route path="/nutzer" element={<Nutzerverwaltung />} />
              <Route path="/plattform-admin" element={<PlattformAdmin />} />
              <Route path="/team-chat" element={<Gruppenchat />} />
              <Route path="/projekt-chat" element={<PaketRoute funktion="projekt_chat"><ProjektChat /></PaketRoute>} />
              <Route path="/material-stamm" element={<PaketRoute funktion="material"><MaterialStamm /></PaketRoute>} />
              <Route path="/projekte/:id" element={<ProjektDashboard />} />
              <Route path="/projekte/:id/aufgaben" element={<Aufgaben />} />
              <Route path="/projekte/:id/material" element={<PaketRoute funktion="material"><Material /></PaketRoute>} />
              <Route path="/projekte/:id/plaene" element={<Plaene />} />
              <Route path="/projekte/:id/plaene/:planId" element={<PlanDetail />} />
              <Route path="/projekte/:id/dokumente" element={<PaketRoute funktion="dokumente"><Dokumente /></PaketRoute>} />
              <Route path="/projekte/:id/tagesberichte" element={<Tagesberichte />} />
              <Route path="/projekte/:id/zeiterfassung" element={<Zeiterfassung />} />
              <Route path="/projekte/:id/termine" element={<PaketRoute funktion="termine"><Termine /></PaketRoute>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
