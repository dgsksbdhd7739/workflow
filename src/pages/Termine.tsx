import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDatum } from '../lib/datum'
import type { Termin, TerminStatus } from '../types/database'

const statusLabel: Record<TerminStatus, string> = {
  geplant: 'Geplant',
  laufend: 'Laufend',
  abgeschlossen: 'Abgeschlossen',
  verzoegert: 'Verzögert',
}

const statusBalken: Record<TerminStatus, string> = {
  geplant: 'bg-slate-400 dark:bg-slate-500',
  laufend: 'bg-brand',
  abgeschlossen: 'bg-emerald-500',
  verzoegert: 'bg-red-500',
}

const statusBadge: Record<TerminStatus, string> = {
  geplant: 'bg-surface-hover text-text-muted',
  laufend: 'bg-brand-soft text-brand-text',
  abgeschlossen: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  verzoegert: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
}

const heute = () => new Date().toISOString().slice(0, 10)
const tageSeitEpoch = (d: string) => Math.floor(new Date(d).getTime() / 86_400_000)

export function Termine() {
  const { id: projektId } = useParams<{ id: string }>()
  const { user, role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const [termine, setTermine] = useState<Termin[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [titel, setTitel] = useState('')
  const [startDatum, setStartDatum] = useState(heute())
  const [endDatum, setEndDatum] = useState(heute())
  const [vorgaengerId, setVorgaengerId] = useState('')

  const load = async () => {
    if (!projektId) return
    setLoading(true)
    const { data } = await supabase
      .from('termine')
      .select('*')
      .eq('projekt_id', projektId)
      .order('start_datum', { ascending: true })
    setTermine(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projektId])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !projektId) return
    setSaving(true)
    setFehler(null)
    const { error } = await supabase.from('termine').insert({
      projekt_id: projektId,
      titel,
      start_datum: startDatum,
      end_datum: endDatum,
      vorgaenger_id: vorgaengerId || null,
      erstellt_von: user.id,
    })
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setTitel('')
    setStartDatum(heute())
    setEndDatum(heute())
    setVorgaengerId('')
    setShowForm(false)
    load()
  }

  const updateStatus = async (id: string, status: TerminStatus) => {
    setFehler(null)
    setTermine((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)))
    const { error } = await supabase.from('termine').update({ status }).eq('id', id)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const anzeigeStatus = (t: Termin): TerminStatus =>
    t.status !== 'abgeschlossen' && t.end_datum < heute() ? 'verzoegert' : t.status

  const minTag = termine.length > 0 ? Math.min(...termine.map((t) => tageSeitEpoch(t.start_datum))) : 0
  const maxTag = termine.length > 0 ? Math.max(...termine.map((t) => tageSeitEpoch(t.end_datum))) : 1
  const spanne = Math.max(maxTag - minTag, 1)

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Termine</h1>
        {kannBearbeiten && (
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            {showForm ? 'Abbrechen' : '+ Meilenstein'}
          </button>
        )}
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3 p-4">
          <div>
            <label className="field-label">Titel</label>
            <input
              required
              autoFocus
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="z. B. Estrich verlegen"
              className="field-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Start</label>
              <input
                type="date"
                required
                value={startDatum}
                onChange={(e) => setStartDatum(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Ende</label>
              <input
                type="date"
                required
                min={startDatum}
                value={endDatum}
                onChange={(e) => setEndDatum(e.target.value)}
                className="field-input"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Vorgänger (Abhängigkeit)</label>
            <select
              value={vorgaengerId}
              onChange={(e) => setVorgaengerId(e.target.value)}
              className="field-input"
            >
              <option value="">— Keiner —</option>
              {termine.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titel}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Speichert…' : 'Meilenstein speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : termine.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Termine geplant.</p>
      ) : (
        <div className="space-y-4">
          <div className="card space-y-2 p-4">
            {termine.map((t) => {
              const status = anzeigeStatus(t)
              const left = ((tageSeitEpoch(t.start_datum) - minTag) / spanne) * 100
              const width = Math.max(((tageSeitEpoch(t.end_datum) - tageSeitEpoch(t.start_datum)) / spanne) * 100, 2)
              const vorgaenger = t.vorgaenger_id ? termine.find((v) => v.id === t.vorgaenger_id) : null
              return (
                <div key={t.id}>
                  <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
                    <span className="truncate font-medium text-text">{t.titel}</span>
                    <span>
                      {formatDatum(t.start_datum)} – {formatDatum(t.end_datum)}
                    </span>
                  </div>
                  <div className="relative h-4 w-full rounded bg-surface-hover">
                    <div
                      style={{ left: `${left}%`, width: `${width}%` }}
                      className={`absolute h-4 rounded ${statusBalken[status]}`}
                      title={`${t.titel}: ${formatDatum(t.start_datum)} – ${formatDatum(t.end_datum)}`}
                    />
                  </div>
                  {vorgaenger && <p className="mt-1 text-xs text-text-subtle">nach: {vorgaenger.titel}</p>}
                </div>
              )
            })}
          </div>

          <ul className="space-y-2">
            {termine.map((t) => {
              const status = anzeigeStatus(t)
              return (
                <li key={t.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-text">{t.titel}</div>
                      <div className="mt-1 text-xs text-text-subtle">
                        {formatDatum(t.start_datum)} – {formatDatum(t.end_datum)}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge[status]}`}>
                      {statusLabel[status]}
                    </span>
                  </div>
                  {kannBearbeiten && (
                    <select
                      value={t.status}
                      onChange={(e) => updateStatus(t.id, e.target.value as TerminStatus)}
                      className="mt-2 rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs text-text"
                    >
                      {(['geplant', 'laufend', 'abgeschlossen'] as const).map((s) => (
                        <option key={s} value={s}>
                          {statusLabel[s]}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
