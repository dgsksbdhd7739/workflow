import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { MangelDetails } from '../components/MangelDetails'
import { SignedImage } from '../components/SignedImage'
import { exportMaengelPdf } from '../lib/pdf'
import type { Baustelle, Mangel, MangelPrioritaet, MangelStatus, StatusVorlageWert } from '../types/database'

const statusLabel: Record<MangelStatus, string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  erledigt: 'Erledigt',
}

const statusColor: Record<MangelStatus, string> = {
  offen: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  in_bearbeitung: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  erledigt: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300',
}

const prioritaetLabel: Record<MangelPrioritaet, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
}

export function Maengel() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user, role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const { profiles, nameOf } = useProfiles()
  const [baustelle, setBaustelle] = useState<Baustelle | null>(null)
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<MangelStatus | 'alle'>('alle')
  const [geoeffnetId, setGeoeffnetId] = useState<string | null>(null)
  const [werteMap, setWerteMap] = useState<Record<string, StatusVorlageWert>>({})
  const [fehler, setFehler] = useState<string | null>(null)

  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [prioritaet, setPrioritaet] = useState<MangelPrioritaet>('mittel')
  const [verantwortlicherId, setVerantwortlicherId] = useState('')
  const [faelligAm, setFaelligAm] = useState('')
  const [foto, setFoto] = useState<File | null>(null)

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const [{ data }, { data: baustelleData }] = await Promise.all([
      supabase.from('maengel').select('*').eq('baustelle_id', baustelleId).order('erstellt_am', { ascending: false }),
      supabase.from('baustellen').select('*').eq('id', baustelleId).single(),
    ])
    setMaengel(data ?? [])
    setBaustelle(baustelleData)
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase
      .from('statusvorlage_werte')
      .select('*')
      .then(({ data }) => {
        const map: Record<string, StatusVorlageWert> = {}
        for (const w of data ?? []) map[w.id] = w
        setWerteMap(map)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelleId])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !baustelleId) return
    setSaving(true)
    setFehler(null)

    let foto_pfad: string | null = null
    if (foto) {
      const path = `${baustelleId}/${Date.now()}-${foto.name}`
      const { error: uploadError } = await supabase.storage.from('mangel-fotos').upload(path, foto)
      if (uploadError) {
        setSaving(false)
        setFehler(`Foto-Upload fehlgeschlagen: ${uploadError.message}`)
        return
      }
      foto_pfad = path
    }

    const { error } = await supabase.from('maengel').insert({
      baustelle_id: baustelleId,
      titel,
      beschreibung: beschreibung || null,
      prioritaet,
      verantwortlicher_id: verantwortlicherId || null,
      faellig_am: faelligAm || null,
      foto_pfad,
      erstellt_von: user.id,
    })

    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setTitel('')
    setBeschreibung('')
    setPrioritaet('mittel')
    setVerantwortlicherId('')
    setFaelligAm('')
    setFoto(null)
    setShowForm(false)
    load()
  }

  const updateStatus = async (mangelId: string, status: MangelStatus) => {
    setFehler(null)
    setMaengel((prev) => prev.map((m) => (m.id === mangelId ? { ...m, status } : m)))
    const { error } = await supabase.from('maengel').update({ status }).eq('id', mangelId)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const gefiltert = filterStatus === 'alle' ? maengel : maengel.filter((m) => m.status === filterStatus)

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Mängel</h1>
        <div className="flex gap-2">
          {baustelle && gefiltert.length > 0 && (
            <button onClick={() => exportMaengelPdf(baustelle, gefiltert, nameOf)} className="btn-secondary">
              PDF exportieren
            </button>
          )}
          {kannBearbeiten && (
            <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
              {showForm ? 'Abbrechen' : '+ Mangel melden'}
            </button>
          )}
        </div>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      <div className="mb-4 flex gap-2">
        {(['alle', 'offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === s ? 'bg-brand text-white' : 'bg-surface-hover text-text-muted'
            }`}
          >
            {s === 'alle' ? 'Alle' : statusLabel[s]}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3 p-4">
          <div>
            <label className="field-label">Titel</label>
            <input
              required
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              className="field-input"
              placeholder="z. B. Riss in der Kellerwand"
            />
          </div>
          <div>
            <label className="field-label">Beschreibung</label>
            <textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              rows={3}
              className="field-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Priorität</label>
              <select
                value={prioritaet}
                onChange={(e) => setPrioritaet(e.target.value as MangelPrioritaet)}
                className="field-input"
              >
                {(['niedrig', 'mittel', 'hoch'] as const).map((p) => (
                  <option key={p} value={p}>
                    {prioritaetLabel[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Fällig am</label>
              <input
                type="date"
                value={faelligAm}
                onChange={(e) => setFaelligAm(e.target.value)}
                className="field-input"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Verantwortlich</label>
            <select
              value={verantwortlicherId}
              onChange={(e) => setVerantwortlicherId(e.target.value)}
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
            <label className="field-label">Foto</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-text-muted"
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Speichert…' : 'Mangel speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : gefiltert.length === 0 ? (
        <p className="text-sm text-text-muted">Keine Mängel in dieser Ansicht.</p>
      ) : (
        <ul className="space-y-3">
          {gefiltert.map((m) => {
            const wert = m.status_wert_id ? werteMap[m.status_wert_id] : undefined
            return (
            <li key={m.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-text">{m.titel}</div>
                  {m.beschreibung && <div className="mt-1 text-sm text-text-muted">{m.beschreibung}</div>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-subtle">
                    <span>Priorität: {prioritaetLabel[m.prioritaet]}</span>
                    <span>Verantwortlich: {nameOf(m.verantwortlicher_id)}</span>
                    {m.faellig_am && <span>Fällig: {m.faellig_am}</span>}
                  </div>
                </div>
                {m.foto_pfad && (
                  <SignedImage
                    bucket="mangel-fotos"
                    path={m.foto_pfad}
                    alt=""
                    className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                  />
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                {wert ? (
                  <span
                    style={{ backgroundColor: `${wert.farbe}22`, color: wert.farbe }}
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                  >
                    {wert.titel}
                  </span>
                ) : (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[m.status]}`}>
                    {statusLabel[m.status]}
                  </span>
                )}
                {!wert && kannBearbeiten && (
                  <select
                    value={m.status}
                    onChange={(e) => updateStatus(m.id, e.target.value as MangelStatus)}
                    className="rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs text-text"
                  >
                    {(['offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
                      <option key={s} value={s}>
                        {statusLabel[s]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {m.plan_id && (
                <Link
                  to={`/baustellen/${baustelleId}/plaene/${m.plan_id}`}
                  className="mt-2 inline-block text-xs text-brand"
                >
                  📍 Position auf Plan ansehen
                </Link>
              )}
              <button
                onClick={() => setGeoeffnetId((prev) => (prev === m.id ? null : m.id))}
                className="mt-2 block text-xs font-medium text-brand"
              >
                {geoeffnetId === m.id ? 'Details ausblenden' : 'Fortschritt & Kommentare'}
              </button>
              {geoeffnetId === m.id && (
                <div className="mt-3 border-t border-border pt-3">
                  <MangelDetails mangelId={m.id} />
                </div>
              )}
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
