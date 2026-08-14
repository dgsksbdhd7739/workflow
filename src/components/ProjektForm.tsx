import { useEffect, useState, type FormEvent } from 'react'
import { supabase, getSignedUrl } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import type { Baustelle } from '../types/database'

const laender = ['Deutschland', 'Österreich', 'Schweiz', 'Sonstiges']
const sprachen = ['Deutsch', 'Englisch']

export function ProjektForm({
  baustelle,
  onSaved,
  onCancel,
}: {
  baustelle?: Baustelle
  onSaved: (b: Baustelle) => void
  onCancel: () => void
}) {
  const { user } = useAuth()
  const { profiles } = useProfiles()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoDatei, setLogoDatei] = useState<File | null>(null)
  const [logoEntfernen, setLogoEntfernen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [name, setName] = useState(baustelle?.name ?? '')
  const [projektnummer, setProjektnummer] = useState(baustelle?.projektnummer ?? '')
  const [projektleiterId, setProjektleiterId] = useState(baustelle?.projektleiter_id ?? '')
  const [obermonteurId, setObermonteurId] = useState(baustelle?.bauleitender_obermonteur_id ?? '')
  const [kundeName, setKundeName] = useState(baustelle?.kunde_name ?? '')
  const [projektBeginn, setProjektBeginn] = useState(baustelle?.projekt_beginn ?? '')
  const [projektEnde, setProjektEnde] = useState(baustelle?.projekt_ende ?? '')
  const [sprache, setSprache] = useState(baustelle?.sprache ?? 'Deutsch')

  const [projektLand, setProjektLand] = useState(baustelle?.projekt_land ?? '')
  const [projektStrasse, setProjektStrasse] = useState(baustelle?.projekt_strasse ?? '')
  const [projektHausnummer, setProjektHausnummer] = useState(baustelle?.projekt_hausnummer ?? '')
  const [projektAdresszusatz, setProjektAdresszusatz] = useState(baustelle?.projekt_adresszusatz ?? '')
  const [projektPlz, setProjektPlz] = useState(baustelle?.projekt_plz ?? '')
  const [projektStadt, setProjektStadt] = useState(baustelle?.projekt_stadt ?? '')

  const [kundenLand, setKundenLand] = useState(baustelle?.kunden_land ?? '')
  const [kundenStrasse, setKundenStrasse] = useState(baustelle?.kunden_strasse ?? '')
  const [kundenHausnummer, setKundenHausnummer] = useState(baustelle?.kunden_hausnummer ?? '')
  const [kundenAdresszusatz, setKundenAdresszusatz] = useState(baustelle?.kunden_adresszusatz ?? '')
  const [kundenPlz, setKundenPlz] = useState(baustelle?.kunden_plz ?? '')
  const [kundenStadt, setKundenStadt] = useState(baustelle?.kunden_stadt ?? '')

  useEffect(() => {
    if (baustelle?.logo_pfad) {
      getSignedUrl('projekt-logos', baustelle.logo_pfad).then(({ url }) => setLogoUrl(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelle?.logo_pfad])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setFehler(null)

    const payload = {
      name,
      projektnummer: projektnummer || null,
      projektleiter_id: projektleiterId || null,
      bauleitender_obermonteur_id: obermonteurId || null,
      kunde_name: kundeName || null,
      projekt_beginn: projektBeginn || null,
      projekt_ende: projektEnde || null,
      sprache,
      projekt_land: projektLand || null,
      projekt_strasse: projektStrasse || null,
      projekt_hausnummer: projektHausnummer || null,
      projekt_adresszusatz: projektAdresszusatz || null,
      projekt_plz: projektPlz || null,
      projekt_stadt: projektStadt || null,
      kunden_land: kundenLand || null,
      kunden_strasse: kundenStrasse || null,
      kunden_hausnummer: kundenHausnummer || null,
      kunden_adresszusatz: kundenAdresszusatz || null,
      kunden_plz: kundenPlz || null,
      kunden_stadt: kundenStadt || null,
    }

    let saved: Baustelle | null = null

    if (baustelle) {
      const { data, error } = await supabase
        .from('baustellen')
        .update(payload)
        .eq('id', baustelle.id)
        .select()
        .single()
      if (error) {
        setFehler(error.message)
        setSaving(false)
        return
      }
      saved = data
    } else {
      const { data, error } = await supabase
        .from('baustellen')
        .insert({ ...payload, created_by: user.id })
        .select()
        .single()
      if (error) {
        setFehler(error.message)
        setSaving(false)
        return
      }
      saved = data
    }

    if (!saved) {
      setSaving(false)
      return
    }

    if (logoEntfernen) {
      await supabase.from('baustellen').update({ logo_pfad: null }).eq('id', saved.id)
      saved.logo_pfad = null
    } else if (logoDatei) {
      const path = `${saved.id}/${Date.now()}-${logoDatei.name}`
      const { error: uploadError } = await supabase.storage.from('projekt-logos').upload(path, logoDatei)
      if (!uploadError) {
        await supabase.from('baustellen').update({ logo_pfad: path }).eq('id', saved.id)
        saved.logo_pfad = path
      }
    }

    setSaving(false)
    onSaved(saved)
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-4">
      {fehler && <p className="banner-error">Fehler: {fehler}</p>}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-shrink-0 flex-col items-start gap-2">
          <div className="h-28 w-28 overflow-hidden rounded-lg bg-surface-hover">
            {logoDatei ? (
              <img src={URL.createObjectURL(logoDatei)} alt="" className="h-full w-full object-cover" />
            ) : logoUrl && !logoEntfernen ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <label className="cursor-pointer text-xs font-medium text-brand">
            Projektlogo hochladen
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
              className="text-xs font-medium text-red-600 dark:text-red-400"
            >
              Projektlogo löschen
            </button>
          )}
        </div>

        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">Name</label>
            <input
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field-input"
            />
            <div className="mt-0.5 text-right text-xs text-text-subtle">{name.length}/60</div>
          </div>
          <div>
            <label className="field-label">Projektnummer</label>
            <input
              value={projektnummer}
              onChange={(e) => setProjektnummer(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Projektleiter</label>
            <select
              value={projektleiterId}
              onChange={(e) => setProjektleiterId(e.target.value)}
              className="field-input"
            >
              <option value="">— Niemand zugewiesen —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Bauleitender Obermonteur</label>
            <select
              value={obermonteurId}
              onChange={(e) => setObermonteurId(e.target.value)}
              className="field-input"
            >
              <option value="">— Niemand zugewiesen —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label className="field-label">Kunde</label>
          <input
            value={kundeName}
            onChange={(e) => setKundeName(e.target.value)}
            className="field-input"
          />
        </div>
        <div>
          <label className="field-label">Projektbeginn</label>
          <input
            type="date"
            value={projektBeginn}
            onChange={(e) => setProjektBeginn(e.target.value)}
            className="field-input"
          />
        </div>
        <div>
          <label className="field-label">Projektende</label>
          <input
            type="date"
            value={projektEnde}
            onChange={(e) => setProjektEnde(e.target.value)}
            className="field-input"
          />
        </div>
      </div>

      <div className="max-w-xs">
        <label className="field-label">Sprache</label>
        <select
          value={sprache}
          onChange={(e) => setSprache(e.target.value)}
          className="field-input"
        >
          {sprachen.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text">Projektadresse</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="field-label">Land</label>
            <select
              value={projektLand}
              onChange={(e) => setProjektLand(e.target.value)}
              className="field-input"
            >
              <option value="">—</option>
              {laender.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Straße</label>
            <input
              value={projektStrasse}
              onChange={(e) => setProjektStrasse(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Hausnummer</label>
            <input
              value={projektHausnummer}
              onChange={(e) => setProjektHausnummer(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Adresszusatz</label>
            <input
              value={projektAdresszusatz}
              onChange={(e) => setProjektAdresszusatz(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Postleitzahl</label>
            <input
              value={projektPlz}
              onChange={(e) => setProjektPlz(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Stadt</label>
            <input
              value={projektStadt}
              onChange={(e) => setProjektStadt(e.target.value)}
              className="field-input"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text">Kundenadresse</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="field-label">Land</label>
            <select
              value={kundenLand}
              onChange={(e) => setKundenLand(e.target.value)}
              className="field-input"
            >
              <option value="">—</option>
              {laender.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Straße</label>
            <input
              value={kundenStrasse}
              onChange={(e) => setKundenStrasse(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Hausnummer</label>
            <input
              value={kundenHausnummer}
              onChange={(e) => setKundenHausnummer(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Adresszusatz</label>
            <input
              value={kundenAdresszusatz}
              onChange={(e) => setKundenAdresszusatz(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Postleitzahl</label>
            <input
              value={kundenPlz}
              onChange={(e) => setKundenPlz(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Stadt</label>
            <input
              value={kundenStadt}
              onChange={(e) => setKundenStadt(e.target.value)}
              className="field-input"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Speichert…' : baustelle ? 'Speichern' : 'Projekt anlegen'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Abbrechen
        </button>
      </div>
    </form>
  )
}
