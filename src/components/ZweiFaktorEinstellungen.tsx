import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function ZweiFaktorEinstellungen() {
  const [loading, setLoading] = useState(true)
  const [aktiverFaktor, setAktiverFaktor] = useState<{ id: string } | null>(null)
  const [einrichtungOffen, setEinrichtungOffen] = useState(false)
  const [neuerFaktor, setNeuerFaktor] = useState<{ id: string; qrCode: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [arbeitet, setArbeitet] = useState(false)

  const laden = async () => {
    setLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    setAktiverFaktor(data?.totp.find((f) => f.status === 'verified') ?? null)
    setLoading(false)
  }

  useEffect(() => {
    laden()
  }, [])

  const starteEinrichtung = async () => {
    setFehler(null)
    setArbeitet(true)
    // Abgebrochene Einrichtungen (App geschlossen vor dem Bestaetigen)
    // hinterlassen unbestaetigte Faktoren; Supabase lehnt dann jeden neuen
    // Faktor mit gleichem (leerem) Namen ab ("factor ... already exists").
    const { data: vorhandene } = await supabase.auth.mfa.listFactors()
    for (const f of vorhandene?.all ?? []) {
      if (f.factor_type === 'totp' && f.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Authenticator ${new Date().toISOString()}`,
    })
    setArbeitet(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setNeuerFaktor({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
    setEinrichtungOffen(true)
  }

  const bestaetigeEinrichtung = async (e: FormEvent) => {
    e.preventDefault()
    if (!neuerFaktor) return
    setFehler(null)
    setArbeitet(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: neuerFaktor.id, code: code.trim() })
    setArbeitet(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setEinrichtungOffen(false)
    setNeuerFaktor(null)
    setCode('')
    laden()
  }

  const abbrechenEinrichtung = async () => {
    if (neuerFaktor) await supabase.auth.mfa.unenroll({ factorId: neuerFaktor.id })
    setEinrichtungOffen(false)
    setNeuerFaktor(null)
    setCode('')
    setFehler(null)
  }

  const deaktivieren = async () => {
    if (!aktiverFaktor) return
    if (!window.confirm('Zwei-Faktor-Authentifizierung wirklich deaktivieren?')) return
    setFehler(null)
    setArbeitet(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: aktiverFaktor.id })
    setArbeitet(false)
    if (error) {
      setFehler(error.message)
      return
    }
    laden()
  }

  if (loading) return <p className="text-sm text-text-muted">Lädt…</p>

  if (einrichtungOffen && neuerFaktor) {
    return (
      <div className="space-y-3">
        {fehler && <p className="banner-error">Fehler: {fehler}</p>}
        <p className="text-sm text-text-muted">
          QR-Code mit einer Authenticator-App (z. B. Google Authenticator, Authy) scannen oder den Code manuell eingeben,
          dann den von der App angezeigten 6-stelligen Code bestätigen.
        </p>
        <img src={neuerFaktor.qrCode} alt="QR-Code für Zwei-Faktor-Authentifizierung" className="h-40 w-40 rounded-lg border border-border" />
        <p className="break-all text-xs text-text-subtle">Code manuell: {neuerFaktor.secret}</p>
        <form onSubmit={bestaetigeEinrichtung} className="flex gap-2">
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="field-input w-32 text-center tracking-[0.3em]"
          />
          <button type="submit" disabled={arbeitet || code.length < 6} className="btn-primary">
            {arbeitet ? 'Prüft…' : 'Bestätigen'}
          </button>
          <button type="button" onClick={abbrechenEinrichtung} className="btn-secondary">
            Abbrechen
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {fehler && <p className="banner-error">Fehler: {fehler}</p>}
      <div className="flex items-center justify-between gap-3">
        <div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              aktiverFaktor
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : 'bg-surface-hover text-text-subtle'
            }`}
          >
            {aktiverFaktor ? 'Aktiv' : 'Nicht aktiviert'}
          </span>
          <p className="mt-1 text-xs text-text-muted">
            Zusätzlicher Sicherheitscode aus einer Authenticator-App bei jeder Anmeldung.
          </p>
        </div>
        {aktiverFaktor ? (
          <button onClick={deaktivieren} disabled={arbeitet} className="btn-secondary flex-shrink-0">
            Deaktivieren
          </button>
        ) : (
          <button onClick={starteEinrichtung} disabled={arbeitet} className="btn-primary flex-shrink-0">
            {arbeitet ? 'Startet…' : 'Aktivieren'}
          </button>
        )}
      </div>
    </div>
  )
}
