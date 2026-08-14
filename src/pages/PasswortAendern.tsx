import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function PasswortAendern() {
  const { user, mussPasswortAendern, setMussPasswortAendern, signOut } = useAuth()
  const navigate = useNavigate()
  const [neuesPasswort, setNeuesPasswort] = useState('')
  const [bestaetigung, setBestaetigung] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [speichert, setSpeichert] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFehler(null)
    if (neuesPasswort.length < 6) {
      setFehler('Das Passwort muss mindestens 6 Zeichen haben.')
      return
    }
    if (neuesPasswort !== bestaetigung) {
      setFehler('Die Passwörter stimmen nicht überein.')
      return
    }
    setSpeichert(true)
    const { error } = await supabase.auth.updateUser({ password: neuesPasswort })
    if (error) {
      setSpeichert(false)
      setFehler(error.message)
      return
    }
    if (user) {
      await supabase.from('profiles').update({ muss_passwort_aendern: false }).eq('id', user.id)
    }
    setSpeichert(false)
    setMussPasswortAendern(false)
    navigate('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="mb-1 text-xl font-semibold text-text">Passwort ändern</h1>
        <p className="mb-6 text-sm text-text-muted">
          {mussPasswortAendern
            ? 'Dein Konto wurde mit einem Standardpasswort angelegt. Bitte vergib jetzt ein eigenes Passwort, bevor du fortfährst.'
            : 'Vergib ein neues Passwort für dein Konto.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">Neues Passwort</label>
            <input
              type="password"
              required
              minLength={6}
              value={neuesPasswort}
              onChange={(e) => setNeuesPasswort(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Passwort bestätigen</label>
            <input
              type="password"
              required
              minLength={6}
              value={bestaetigung}
              onChange={(e) => setBestaetigung(e.target.value)}
              className="field-input"
            />
          </div>

          {fehler && <p className="text-sm text-red-600 dark:text-red-400">{fehler}</p>}

          <button type="submit" disabled={speichert} className="btn-primary w-full">
            {speichert ? 'Speichert…' : 'Passwort speichern'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          {!mussPasswortAendern && (
            <button onClick={() => navigate(-1)} className="text-text-subtle">
              Zurück
            </button>
          )}
          <button onClick={() => signOut()} className="ml-auto text-text-subtle">
            Abmelden
          </button>
        </div>
      </div>
    </div>
  )
}
