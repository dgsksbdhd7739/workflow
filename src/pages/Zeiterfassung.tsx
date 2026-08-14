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
  const { user } = useAuth()
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
    if (!error) {
      setDatum(heute())
      setStartZeit(jetzt())
      setEndZeit('')
      setPauseMinuten('30')
      setTaetigkeit('')
      setShowForm(false)
      load()
    }
  }

  const dauer = (start: string, end: string | null, pause: number) => {
    if (!end) return '—'
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const minuten = eh * 60 + em - (sh * 60 + sm) - pause
    if (minuten < 0) return '—'
    return `${Math.floor(minuten / 60)}h ${minuten % 60}min`
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Zeiterfassung</h1>
        <button
          onClick={openForm}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Abbrechen' : '+ Zeit erfassen'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
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
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-600'
                  }`}
                >
                  {p.full_name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Datum</label>
              <input
                type="date"
                required
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Pause (Minuten)</label>
              <input
                type="number"
                min={0}
                value={pauseMinuten}
                onChange={(e) => setPauseMinuten(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Beginn</label>
              <input
                type="time"
                required
                value={startZeit}
                onChange={(e) => setStartZeit(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Ende</label>
              <input
                type="time"
                value={endZeit}
                onChange={(e) => setEndZeit(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tätigkeit</label>
            <input
              value={taetigkeit}
              onChange={(e) => setTaetigkeit(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="z. B. Verputzarbeiten OG"
            />
          </div>
          <button
            type="submit"
            disabled={saving || ausgewaehlt.length === 0}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Speichert…' : ausgewaehlt.length > 1 ? `Zeit für ${ausgewaehlt.length} Personen speichern` : 'Zeit speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : eintraege.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Zeiten erfasst.</p>
      ) : (
        <ul className="space-y-2">
          {eintraege.map((z) => (
            <li key={z.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{z.datum}</span>
                <span className="text-xs text-gray-500">{nameOf(z.user_id)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                <span>
                  {z.start_zeit.slice(0, 5)} – {z.end_zeit ? z.end_zeit.slice(0, 5) : 'läuft'}
                </span>
                <span>Pause: {z.pause_minuten} min</span>
                <span>Dauer: {dauer(z.start_zeit, z.end_zeit, z.pause_minuten)}</span>
              </div>
              {z.taetigkeit && <p className="mt-1 text-sm text-gray-700">{z.taetigkeit}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
