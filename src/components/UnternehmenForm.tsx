import { useEffect, useState, type FormEvent } from 'react'
import { supabase, getSignedUrl, uploadFile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { komprimiereBild } from '../lib/bildKompression'
import type { Unternehmen } from '../types/database'

const laender = ['Deutschland', 'Österreich', 'Schweiz', 'Sonstiges']

export function UnternehmenForm() {
  const { unternehmenId } = useAuth()
  const [unternehmen, setUnternehmen] = useState<Unternehmen | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoDatei, setLogoDatei] = useState<File | null>(null)
  const [logoEntfernen, setLogoEntfernen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [gespeichert, setGespeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [strasse, setStrasse] = useState('')
  const [hausnummer, setHausnummer] = useState('')
  const [plz, setPlz] = useState('')
  const [stadt, setStadt] = useState('')
  const [land, setLand] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')

  useEffect(() => {
    if (!unternehmenId) return
    supabase
      .from('unternehmen')
      .select('*')
      .eq('id', unternehmenId)
      .single()
      .then(async ({ data }) => {
        if (data) {
          setUnternehmen(data)
          setName(data.name ?? '')
          setStrasse(data.strasse ?? '')
          setHausnummer(data.hausnummer ?? '')
          setPlz(data.plz ?? '')
          setStadt(data.stadt ?? '')
          setLand(data.land ?? '')
          setTelefon(data.telefon ?? '')
          setEmail(data.email ?? '')
          setWebsite(data.website ?? '')
          if (data.logo_pfad) {
            const { url } = await getSignedUrl('unternehmen-logos', data.logo_pfad)
            setLogoUrl(url)
          }
        }
        setLoading(false)
      })
  }, [unternehmenId])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!unternehmenId) return
    setSaving(true)
    setFehler(null)
    setGespeichert(false)

    let logo_pfad = unternehmen?.logo_pfad ?? null
    if (logoEntfernen) {
      logo_pfad = null
    } else if (logoDatei) {
      const logoKomprimiert = await komprimiereBild(logoDatei, { maxBreiteHoehe: 800 })
      const path = `${unternehmenId}/${Date.now()}-${logoKomprimiert.name}`
      const { error: uploadError } = await uploadFile('unternehmen-logos', path, logoKomprimiert)
      if (uploadError) {
        setSaving(false)
        setFehler(`Logo-Upload fehlgeschlagen: ${uploadError.message}`)
        return
      }
      logo_pfad = path
    }

    const { data: aktualisiert, error } = await supabase
      .from('unternehmen')
      .update({
        name: name.trim() || 'Mein Unternehmen',
        strasse: strasse.trim() || null,
        hausnummer: hausnummer.trim() || null,
        plz: plz.trim() || null,
        stadt: stadt.trim() || null,
        land: land || null,
        telefon: telefon.trim() || null,
        email: email.trim() || null,
        website: website.trim() || null,
        logo_pfad,
      })
      .eq('id', unternehmenId)
      .select()
      .single()

    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    if (aktualisiert) setUnternehmen(aktualisiert)
    setLogoDatei(null)
    setLogoEntfernen(false)
    setGespeichert(true)
  }

  if (loading) return <p className="text-sm text-text-muted">Lädt…</p>

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {fehler && <p className="banner-error">Fehler: {fehler}</p>}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-shrink-0 flex-col items-start gap-2">
          <div className="h-20 w-20 overflow-hidden rounded-lg bg-surface-hover">
            {logoDatei ? (
              <img src={URL.createObjectURL(logoDatei)} alt="" className="h-full w-full object-cover" />
            ) : logoUrl && !logoEntfernen ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <label className="cursor-pointer text-xs font-medium text-brand">
            Firmenlogo hochladen
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                setLogoDatei(e.target.files?.[0] ?? null)
                setLogoEntfernen(false)
              }}
            />
          </label>
          {(logoUrl || logoDatei) && !logoEntfernen && (
            <button
              type="button"
              onClick={() => {
                setLogoDatei(null)
                setLogoEntfernen(true)
              }}
              className="text-xs text-text-subtle hover:text-red-600 dark:hover:text-red-400"
            >
              Entfernen
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <label className="field-label">Firmenname</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="field-input" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={strasse}
              onChange={(e) => setStrasse(e.target.value)}
              placeholder="Straße"
              className="field-input col-span-2"
            />
            <input
              value={hausnummer}
              onChange={(e) => setHausnummer(e.target.value)}
              placeholder="Nr."
              className="field-input"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input value={plz} onChange={(e) => setPlz(e.target.value)} placeholder="PLZ" className="field-input" />
            <input
              value={stadt}
              onChange={(e) => setStadt(e.target.value)}
              placeholder="Stadt"
              className="field-input col-span-2"
            />
          </div>
          <select value={land} onChange={(e) => setLand(e.target.value)} className="field-input">
            <option value="">— Land wählen —</option>
            {laender.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Telefon" className="field-input" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail" className="field-input" />
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" className="field-input" />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Speichert…' : 'Unternehmen speichern'}
        </button>
        {gespeichert && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Gespeichert ✓</span>}
      </div>
      <p className="text-xs text-text-subtle">
        Diese Angaben erscheinen im Kopf jedes PDF-Exports (Bautagebuch, Aufgaben- und Materiallisten).
      </p>
    </form>
  )
}
