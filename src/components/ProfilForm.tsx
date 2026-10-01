import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Profile } from '../types/database'

export function ProfilForm() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [gespeichert, setGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [telefon, setTelefon] = useState('')
  const [positionsbezeichnung, setPositionsbezeichnung] = useState('')
  const [strasse, setStrasse] = useState('')
  const [plz, setPlz] = useState('')
  const [stadt, setStadt] = useState('')

  const [neueEmail, setNeueEmail] = useState('')
  const [emailFormOffen, setEmailFormOffen] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailGesendet, setEmailGesendet] = useState(false)
  const [emailFehler, setEmailFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }: { data: Profile | null }) => {
        if (data) {
          setFullName(data.full_name ?? '')
          setTelefon(data.telefon ?? '')
          setPositionsbezeichnung(data.positionsbezeichnung ?? '')
          setStrasse(data.strasse ?? '')
          setPlz(data.plz ?? '')
          setStadt(data.stadt ?? '')
        }
        setLoading(false)
      })
  }, [user])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setFehler(null)
    setGespeichert(false)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || user.email || '',
        telefon: telefon.trim() || null,
        positionsbezeichnung: positionsbezeichnung.trim() || null,
        strasse: strasse.trim() || null,
        plz: plz.trim() || null,
        stadt: stadt.trim() || null,
      })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setGespeichert(true)
  }

  const handleEmailAendern = async (e: FormEvent) => {
    e.preventDefault()
    if (!neueEmail.trim()) return
    setEmailSaving(true)
    setEmailFehler(null)
    setEmailGesendet(false)
    const { error } = await supabase.auth.updateUser({ email: neueEmail.trim() })
    setEmailSaving(false)
    if (error) {
      setEmailFehler(error.message)
      return
    }
    setEmailGesendet(true)
    setNeueEmail('')
  }

  if (loading) return <p className="text-sm text-text-muted">Lädt…</p>

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-2">
        {fehler && <p className="banner-error">Fehler: {fehler}</p>}
        <div>
          <label className="field-label">Name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="field-input" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Telefon" className="field-input" />
          <input
            value={positionsbezeichnung}
            onChange={(e) => setPositionsbezeichnung(e.target.value)}
            placeholder="Position (z. B. Bauleiter)"
            className="field-input"
          />
        </div>
        <input value={strasse} onChange={(e) => setStrasse(e.target.value)} placeholder="Straße & Hausnummer" className="field-input" />
        <div className="grid grid-cols-3 gap-2">
          <input value={plz} onChange={(e) => setPlz(e.target.value)} placeholder="PLZ" className="field-input" />
          <input value={stadt} onChange={(e) => setStadt(e.target.value)} placeholder="Stadt" className="field-input col-span-2" />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Speichert…' : 'Profil speichern'}
          </button>
          {gespeichert && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Gespeichert ✓</span>}
        </div>
      </form>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-text">E-Mail-Adresse</div>
            <div className="text-xs text-text-muted">{user?.email}</div>
          </div>
          <button type="button" onClick={() => setEmailFormOffen((v) => !v)} className="btn-secondary">
            {emailFormOffen ? 'Abbrechen' : 'E-Mail ändern'}
          </button>
        </div>
        {emailFormOffen && (
          <form onSubmit={handleEmailAendern} className="mt-2 flex gap-2">
            <input
              type="email"
              required
              value={neueEmail}
              onChange={(e) => setNeueEmail(e.target.value)}
              placeholder="neue@email.de"
              className="field-input flex-1"
            />
            <button type="submit" disabled={emailSaving} className="btn-primary">
              {emailSaving ? 'Sendet…' : 'Bestätigungslink senden'}
            </button>
          </form>
        )}
        {emailFehler && <p className="banner-error mt-2">Fehler: {emailFehler}</p>}
        {emailGesendet && (
          <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
            Bestätigungslinks an die alte und neue Adresse gesendet — die Änderung gilt erst nach Bestätigung.
          </p>
        )}
      </div>
    </div>
  )
}
