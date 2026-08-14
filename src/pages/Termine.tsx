import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Termin, TerminStatus } from '../types/database'

const statusLabel: Record<TerminStatus, string> = {
  geplant: 'Geplant',
  laufend: 'Laufend',
  abgeschlossen: 'Abgeschlossen',
  verzoegert: 'Verzögert',
}

const statusBalken: Record<TerminStatus, string> = {
  geplant: 'bg-gray-400',
  laufend: 'bg-blue-500',
  abgeschlossen: 'bg-green-500',
  verzoegert: 'bg-red-500',
}

const statusBadge: Record<TerminStatus, string> = {
  geplant: 'bg-gray-100 text-gray-700',
  laufend: 'bg-blue-100 text-blue-700',
  abgeschlossen: 'bg-green-100 text-green-700',
  verzoegert: 'bg-red-100 text-red-700',
}

const heute = () => new Date().toISOString().slice(0, 10)
const tageSeitEpoch = (d: string) => Math.floor(new Date(d).getTime() / 86_400_000)

export function Termine() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [termine, setTermine] = useState<Termin[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [titel, setTitel] = useState('')
  const [startDatum, setStartDatum] = useState(heute())
  const [endDatum, setEndDatum] = useState(heute())
  const [vorgaengerId, setVorgaengerId] = useState('')

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const { data } = await supabase
      .from('termine')
      .select('*')
      .eq('baustelle_id', baustelleId)
      .order('start_datum', { ascending: true })
    setTermine(data ?? [])
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
    await supabase.from('termine').insert({
      baustelle_id: baustelleId,
      titel,
      start_datum: startDatum,
      end_datum: endDatum,
      vorgaenger_id: vorgaengerId || null,
      erstellt_von: user.id,
    })
    setSaving(false)
    setTitel('')
    setStartDatum(heute())
    setEndDatum(heute())
    setVorgaengerId('')
    setShowForm(false)
    load()
  }

  const updateStatus = async (id: string, status: TerminStatus) => {
    setTermine((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)))
    await supabase.from('termine').update({ status }).eq('id', id)
  }

  const anzeigeStatus = (t: Termin): TerminStatus =>
    t.status !== 'abgeschlossen' && t.end_datum < heute() ? 'verzoegert' : t.status

  const minTag = termine.length > 0 ? Math.min(...termine.map((t) => tageSeitEpoch(t.start_datum))) : 0
  const maxTag = termine.length > 0 ? Math.max(...termine.map((t) => tageSeitEpoch(t.end_datum))) : 1
  const spanne = Math.max(maxTag - minTag, 1)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Termine</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Abbrechen' : '+ Meilenstein'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Titel</label>
            <input
              required
              autoFocus
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="z. B. Estrich verlegen"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Start</label>
              <input
                type="date"
                required
                value={startDatum}
                onChange={(e) => setStartDatum(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Ende</label>
              <input
                type="date"
                required
                min={startDatum}
                value={endDatum}
                onChange={(e) => setEndDatum(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Vorgänger (Abhängigkeit)</label>
            <select
              value={vorgaengerId}
              onChange={(e) => setVorgaengerId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— Keiner —</option>
              {termine.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titel}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Speichert…' : 'Meilenstein speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : termine.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Termine geplant.</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
            {termine.map((t) => {
              const status = anzeigeStatus(t)
              const left = ((tageSeitEpoch(t.start_datum) - minTag) / spanne) * 100
              const width = Math.max(((tageSeitEpoch(t.end_datum) - tageSeitEpoch(t.start_datum)) / spanne) * 100, 2)
              const vorgaenger = t.vorgaenger_id ? termine.find((v) => v.id === t.vorgaenger_id) : null
              return (
                <div key={t.id}>
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                    <span className="truncate font-medium text-gray-900">{t.titel}</span>
                    <span>
                      {t.start_datum} – {t.end_datum}
                    </span>
                  </div>
                  <div className="relative h-4 w-full rounded bg-gray-100">
                    <div
                      style={{ left: `${left}%`, width: `${width}%` }}
                      className={`absolute h-4 rounded ${statusBalken[status]}`}
                      title={`${t.titel}: ${t.start_datum} – ${t.end_datum}`}
                    />
                  </div>
                  {vorgaenger && <p className="mt-1 text-xs text-gray-400">nach: {vorgaenger.titel}</p>}
                </div>
              )
            })}
          </div>

          <ul className="space-y-2">
            {termine.map((t) => {
              const status = anzeigeStatus(t)
              return (
                <li key={t.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-900">{t.titel}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {t.start_datum} – {t.end_datum}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[status]}`}>
                      {statusLabel[status]}
                    </span>
                  </div>
                  <select
                    value={t.status}
                    onChange={(e) => updateStatus(t.id, e.target.value as TerminStatus)}
                    className="mt-2 rounded-lg border border-gray-300 px-2 py-1 text-xs"
                  >
                    {(['geplant', 'laufend', 'abgeschlossen'] as const).map((s) => (
                      <option key={s} value={s}>
                        {statusLabel[s]}
                      </option>
                    ))}
                  </select>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
