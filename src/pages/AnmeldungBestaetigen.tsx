import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function AnmeldungBestaetigen() {
  const { bestaetigeMfaCode, signOut } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [pruefend, setPruefend] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFehler(null)
    setPruefend(true)
    const { error } = await bestaetigeMfaCode(code.trim())
    setPruefend(false)
    if (error) {
      setFehler(error)
      return
    }
    navigate('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="mb-1 text-xl font-semibold text-text">Anmeldung bestätigen</h1>
        <p className="mb-6 text-sm text-text-muted">
          Zusätzliche Sicherheitsabfrage: Gib den 6-stelligen Code aus deiner Authenticator-App ein.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">Code</label>
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="field-input text-center text-lg tracking-[0.3em]"
              placeholder="000000"
            />
          </div>

          {fehler && <p className="text-sm text-red-600 dark:text-red-400">{fehler}</p>}

          <button type="submit" disabled={pruefend || code.length < 6} className="btn-primary w-full">
            {pruefend ? 'Prüft…' : 'Bestätigen'}
          </button>
        </form>

        <div className="mt-4 text-right text-sm">
          <button onClick={() => signOut()} className="text-text-subtle">
            Abmelden
          </button>
        </div>
      </div>
    </div>
  )
}
