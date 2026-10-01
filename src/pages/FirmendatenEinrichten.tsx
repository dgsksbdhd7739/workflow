import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { UnternehmenForm } from '../components/UnternehmenForm'

// Pflichtschritt nach dem ersten Passwortwechsel eines Firmen-Admins: ohne
// vollstaendige Firmendaten inkl. Logo geht es nicht weiter (siehe
// ProtectedRoute und lib/firmendaten.ts).
export function FirmendatenEinrichten() {
  const { firmendatenFehlen, pruefeFirmendaten, signOut } = useAuth()
  const [hinweis, setHinweis] = useState<string | null>(null)

  if (!firmendatenFehlen) return <Navigate to="/" replace />

  const nachSpeichern = async () => {
    await pruefeFirmendaten()
    setHinweis('Bitte alle Pflichtfelder ausfüllen und ein Firmenlogo hochladen.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
      <div className="card w-full max-w-2xl p-6 sm:p-8">
        <h1 className="mb-1 text-xl font-semibold text-text">Firmendaten einrichten</h1>
        <p className="mb-6 text-sm text-text-muted">
          Bevor es losgeht, hinterlege bitte die Daten deiner Firma inklusive Firmenlogo. Sie erscheinen unter anderem
          im Kopf jedes PDF-Exports. Die Website ist optional, alle anderen Angaben sind Pflicht.
        </p>
        {hinweis && <p className="banner-error mb-4">{hinweis}</p>}
        <UnternehmenForm pflicht onGespeichert={nachSpeichern} />
        <button onClick={() => signOut()} className="btn-ghost mt-4 text-xs">
          Abmelden
        </button>
      </div>
    </div>
  )
}
