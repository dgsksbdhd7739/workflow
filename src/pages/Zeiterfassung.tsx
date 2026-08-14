import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import type { Zeiterfassung as ZeiterfassungEntry } from '../types/database'

const heute = () => new Date().toISOString().slice(0, 10)
const jetzt = () => new Date().toTimeString().slice(0, 5)

export function Zeiterfassung() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user, role } = useAuth()
  const { profiles, nameOf } = useProfiles()
  const [eintraege, setEintraege] = useState<ZeiterfassungEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [datum, setDatum] = useState(heute())
  const [startZeit, setStartZeit] = useState(jetzt())
  const [endZeit, setEndZeit] = useState('')
  const [pauseMinuten, setPauseMinuten] = useState('30')
  const [taetigkeit, setTaetigkeit] = useState('')
  const [ausgewaehlt, setAusgewaehlt] = useState<string[]>([])
  const [fehler, setFehler] = useState<string | null>(null)

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const { data } = await supabase
      .from('zeiterfassung')
      .select('*')
      .eq('baustelle_id', baustelleId)
      .order('datum', { ascending: false })
      .order('start_zeit', { ascending: false })
    setEintraege(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelleId])

  const toggleMitarbeiter = (id: string) => {
    setAusgewaehlt((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const openForm = () => {
    setAusgewaehlt(user ? [user.id] : [])
    setShowForm((v) => !v)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !baustelleId || ausgewaehlt.length === 0) return
    setSaving(true)
    setFehler(null)
    const eintraege = ausgewaehlt.map((userId) => ({
      baustelle_id: baustelleId,
      user_id: userId,
      datum,
      start_zeit: startZeit,
      end_zeit: endZeit || null,
      pause_minuten: Number(pauseMinuten) || 0,
      taetigkeit: taetigkeit || null,
    }))
    const { error } = await supabase.from('zeiterfassung').insert(eintraege)
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setDatum(heute())
    setStartZeit(jetzt())
    setEndZeit('')
    setPauseMinuten('30')
    setTaetigkeit('')
    setShowForm(false)
    load()
  }

  const dauer = (start: string, end: string | null, pause: number) => {
    if (!end) return '—'
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const minuten = eh * 60 + em - (sh * 60 + sm) - pause
    if (minuten < 0) return '—'
    return `${Math.floor(minuten / 60)}h ${minuten % 60}min`
  }

  if (role === 'kunde') {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — die Zeiterfassung ist internen Nutzern vorbehalten.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Zeiterfassung</h1>
        <button onClick={openForm} className="btn-primary">
          {showForm ? 'Abbrechen' : '+ Zeit erfassen'}
        </button>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3 p-4">
          <div>
            <label className="field-label">
              Mitarbeiter ({ausgewaehlt.length} ausgewählt)
            </label>
            <div className="flex flex-wrap gap-2">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleMitarbeiter(p.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    ausgewaehlt.includes(p.id)
                      ? 'border-brand bg-brand-soft text-brand-text'
                      : 'border-border-strong text-text-muted'
                  }`}
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Datum</label>
              <input
                type="date"
                required
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Pause (Minuten)</label>
              <input
                type="number"
                min={0}
                value={pauseMinuten}
                onChange={(e) => setPauseMinuten(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Beginn</label>
              <input
                type="time"
                required
                value={startZeit}
                onChange={(e) => setStartZeit(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Ende</label>
              <input
                type="time"
                value={endZeit}
                onChange={(e) => setEndZeit(e.target.value)}
                className="field-input"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Tätigkeit</label>
            <input
              value={taetigkeit}
              onChange={(e) => setTaetigkeit(e.target.value)}
              className="field-input"
              placeholder="z. B. Verputzarbeiten OG"
            />
          </div>
          <button type="submit" disabled={saving || ausgewaehlt.length === 0} className="btn-primary">
            {saving ? 'Speichert…' : ausgewaehlt.length > 1 ? `Zeit für ${ausgewaehlt.length} Personen speichern` : 'Zeit speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : eintraege.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Zeiten erfasst.</p>
      ) : (
        <ul className="space-y-2">
          {eintraege.map((z) => (
            <li key={z.id} className="card p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-text">{z.datum}</span>
                <span className="text-xs text-text-subtle">{nameOf(z.user_id)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                <span>
                  {z.start_zeit.slice(0, 5)} – {z.end_zeit ? z.end_zeit.slice(0, 5) : 'läuft'}
                </span>
                <span>Pause: {z.pause_minuten} min</span>
                <span>Dauer: {dauer(z.start_zeit, z.end_zeit, z.pause_minuten)}</span>
              </div>
              {z.taetigkeit && <p className="mt-1 text-sm text-text-muted">{z.taetigkeit}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
