import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Leistung } from '../types/database'

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

export function Kalkulation() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [leistungen, setLeistungen] = useState<Leistung[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

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
    const naechstePosition = leistungen.length > 0 ? Math.max(...leistungen.map((l) => l.position_nr)) + 1 : 1
    await supabase.from('leistungen').insert({
      baustelle_id: baustelleId,
      position_nr: naechstePosition,
      bezeichnung,
      menge: Number(menge) || 0,
      einheit,
      einzelpreis: Number(einzelpreis) || 0,
      erstellt_von: user.id,
    })
    setSaving(false)
    setBezeichnung('')
    setMenge('1')
    setEinheit('Stk')
    setEinzelpreis('')
    setShowForm(false)
    load()
  }

  const handleDelete = async (id: string) => {
    setLeistungen((prev) => prev.filter((l) => l.id !== id))
    await supabase.from('leistungen').delete().eq('id', id)
  }

  const summe = leistungen.reduce((acc, l) => acc + l.menge * l.einzelpreis, 0)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Kalkulation</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Abbrechen' : '+ Position'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bezeichnung</label>
            <input
              required
              autoFocus
              value={bezeichnung}
              onChange={(e) => setBezeichnung(e.target.value)}
              placeholder="z. B. Trockenbauwand, 12,5mm"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Menge</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={menge}
                onChange={(e) => setMenge(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Einheit</label>
              <input
                value={einheit}
                onChange={(e) => setEinheit(e.target.value)}
                placeholder="m², Stk, h …"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Einzelpreis (€)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={einzelpreis}
                onChange={(e) => setEinzelpreis(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Speichert…' : 'Position speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : leistungen.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Positionen erfasst.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
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
                <tr key={l.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 text-gray-500">{l.position_nr}</td>
                  <td className="px-3 py-2 text-gray-900">{l.bezeichnung}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{l.menge.toLocaleString('de-DE')}</td>
                  <td className="px-3 py-2 text-gray-700">{l.einheit}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{euro(l.einzelpreis)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{euro(l.menge * l.einzelpreis)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => handleDelete(l.id)} className="text-xs text-red-600">
                      Entfernen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="px-3 py-3 text-right text-sm font-medium text-gray-700">
                  Gesamtsumme
                </td>
                <td className="px-3 py-3 text-right text-sm font-semibold text-gray-900">{euro(summe)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
