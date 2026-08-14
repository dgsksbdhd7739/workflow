import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Leistung } from '../types/database'

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

export function Kalkulation() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user, role } = useAuth()
  const [leistungen, setLeistungen] = useState<Leistung[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const [bezeichnung, setBezeichnung] = useState('')
  const [menge, setMenge] = useState('1')
  const [einheit, setEinheit] = useState('Stk')
  const [einzelpreis, setEinzelpreis] = useState('')

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const { data } = await supabase
      .from('leistungen')
      .select('*')
      .eq('baustelle_id', baustelleId)
      .order('position_nr', { ascending: true })
    setLeistungen(data ?? [])
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
    const naechstePosition = leistungen.length > 0 ? Math.max(...leistungen.map((l) => l.position_nr)) + 1 : 1
    const { error } = await supabase.from('leistungen').insert({
      baustelle_id: baustelleId,
      position_nr: naechstePosition,
      bezeichnung,
      menge: Number(menge) || 0,
      einheit,
      einzelpreis: Number(einzelpreis) || 0,
      erstellt_von: user.id,
    })
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setBezeichnung('')
    setMenge('1')
    setEinheit('Stk')
    setEinzelpreis('')
    setShowForm(false)
    load()
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Diese Position wirklich entfernen?')) return
    setFehler(null)
    setLeistungen((prev) => prev.filter((l) => l.id !== id))
    const { error } = await supabase.from('leistungen').delete().eq('id', id)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const summe = leistungen.reduce((acc, l) => acc + l.menge * l.einzelpreis, 0)

  if (role && role !== 'admin' && role !== 'planer') {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — die Kalkulation ist Admin und Planer vorbehalten.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Kalkulation</h1>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          {showForm ? 'Abbrechen' : '+ Position'}
        </button>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3 p-4">
          <div>
            <label className="field-label">Bezeichnung</label>
            <input
              required
              autoFocus
              value={bezeichnung}
              onChange={(e) => setBezeichnung(e.target.value)}
              placeholder="z. B. Trockenbauwand, 12,5mm"
              className="field-input"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="field-label">Menge</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={menge}
                onChange={(e) => setMenge(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Einheit</label>
              <input
                value={einheit}
                onChange={(e) => setEinheit(e.target.value)}
                placeholder="m², Stk, h …"
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Einzelpreis (€)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={einzelpreis}
                onChange={(e) => setEinzelpreis(e.target.value)}
                className="field-input"
              />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Speichert…' : 'Position speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : leistungen.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Positionen erfasst.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="px-3 py-2 font-medium">Pos.</th>
                <th className="px-3 py-2 font-medium">Bezeichnung</th>
                <th className="px-3 py-2 text-right font-medium">Menge</th>
                <th className="px-3 py-2 font-medium">Einheit</th>
                <th className="px-3 py-2 text-right font-medium">Einzelpreis</th>
                <th className="px-3 py-2 text-right font-medium">Summe</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {leistungen.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-text-subtle">{l.position_nr}</td>
                  <td className="px-3 py-2 text-text">{l.bezeichnung}</td>
                  <td className="px-3 py-2 text-right text-text-muted">{l.menge.toLocaleString('de-DE')}</td>
                  <td className="px-3 py-2 text-text-muted">{l.einheit}</td>
                  <td className="px-3 py-2 text-right text-text-muted">{euro(l.einzelpreis)}</td>
                  <td className="px-3 py-2 text-right font-medium text-text">{euro(l.menge * l.einzelpreis)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => handleDelete(l.id)}
                      className="text-xs text-red-600 dark:text-red-400"
                    >
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="px-3 py-3 text-right text-sm font-medium text-text-muted">
                  Gesamtsumme
                </td>
                <td className="px-3 py-3 text-right text-sm font-semibold text-text">{euro(summe)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
