import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { exportTagesberichtePdf } from '../lib/pdf'
import type { Baustelle, Tagesbericht } from '../types/database'

const heute = () => new Date().toISOString().slice(0, 10)

export function Tagesberichte() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { nameOf } = useProfiles()
  const [baustelle, setBaustelle] = useState<Baustelle | null>(null)
  const [berichte, setBerichte] = useState<Tagesbericht[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [datum, setDatum] = useState(heute())
  const [wetter, setWetter] = useState('')
  const [temperatur, setTemperatur] = useState('')
  const [personalAnzahl, setPersonalAnzahl] = useState('')
  const [taetigkeiten, setTaetigkeiten] = useState('')
  const [besonderheiten, setBesonderheiten] = useState('')

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const [{ data }, { data: baustelleData }] = await Promise.all([
      supabase.from('tagesberichte').select('*').eq('baustelle_id', baustelleId).order('datum', { ascending: false }),
      supabase.from('baustellen').select('*').eq('id', baustelleId).single(),
    ])
    setBerichte(data ?? [])
    setBaustelle(baustelleData)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelleId])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !baustelleId) return
    setSaving(true)
    setFehler(null)
    const { error } = await supabase.from('tagesberichte').insert({
      baustelle_id: baustelleId,
      datum,
      wetter: wetter || null,
      temperatur: temperatur ? Number(temperatur) : null,
      personal_anzahl: personalAnzahl ? Number(personalAnzahl) : null,
      taetigkeiten: taetigkeiten || null,
      besonderheiten: besonderheiten || null,
      erstellt_von: user.id,
    })
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setDatum(heute())
    setWetter('')
    setTemperatur('')
    setPersonalAnzahl('')
    setTaetigkeiten('')
    setBesonderheiten('')
    setShowForm(false)
    load()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Bautagebuch</h1>
        <div className="flex gap-2">
          {baustelle && berichte.length > 0 && (
            <button
              onClick={() => exportTagesberichtePdf(baustelle, berichte)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              PDF exportieren
            </button>
          )}
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {showForm ? 'Abbrechen' : '+ Tagesbericht'}
          </button>
        </div>
      </div>

      {fehler && (
        <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          Fehler: {fehler}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
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
              <label className="mb-1 block text-sm font-medium text-gray-700">Personal (Anzahl)</label>
              <input
                type="number"
                min={0}
                value={personalAnzahl}
                onChange={(e) => setPersonalAnzahl(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Wetter</label>
              <input
                value={wetter}
                onChange={(e) => setWetter(e.target.value)}
                placeholder="z. B. sonnig, 18°C"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Temperatur (°C)</label>
              <input
                type="number"
                value={temperatur}
                onChange={(e) => setTemperatur(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Tätigkeiten</label>
            <textarea
              value={taetigkeiten}
              onChange={(e) => setTaetigkeiten(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Besonderheiten</label>
            <textarea
              value={besonderheiten}
              onChange={(e) => setBesonderheiten(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Speichert…' : 'Tagesbericht speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : berichte.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Tagesberichte.</p>
      ) : (
        <ul className="space-y-3">
          {berichte.map((b) => (
            <li key={b.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-gray-900">{b.datum}</span>
                <span className="text-xs text-gray-500">{nameOf(b.erstellt_von)}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                {b.wetter && <span>Wetter: {b.wetter}</span>}
                {b.temperatur !== null && <span>{b.temperatur}°C</span>}
                {b.personal_anzahl !== null && <span>Personal: {b.personal_anzahl}</span>}
              </div>
              {b.taetigkeiten && <p className="mt-2 text-sm text-gray-700">{b.taetigkeiten}</p>}
              {b.besonderheiten && (
                <p className="mt-1 text-sm text-amber-700">⚠ {b.besonderheiten}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
