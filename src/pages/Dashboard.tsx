import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Baustelle } from '../types/database'

export function Dashboard() {
  const { user } = useAuth()
  const [baustellen, setBaustellen] = useState<Baustelle[]>([])
  const [favoritenIds, setFavoritenIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [adresse, setAdresse] = useState('')
  const [saving, setSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const [{ data: baustellenData }, { data: favoritenData }] = await Promise.all([
      supabase.from('baustellen').select('*').order('created_at', { ascending: false }),
      supabase.from('favoriten').select('baustelle_id').eq('user_id', user.id),
    ])
    setBaustellen(baustellenData ?? [])
    setFavoritenIds(new Set((favoritenData ?? []).map((f) => f.baustelle_id)))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setFehler(null)
    const { error } = await supabase.from('baustellen').insert({ name, adresse, created_by: user.id })
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setName('')
    setAdresse('')
    setShowForm(false)
    load()
  }

  const toggleFavorit = async (baustelleId: string) => {
    if (!user) return
    const istFavorit = favoritenIds.has(baustelleId)
    setFavoritenIds((prev) => {
      const next = new Set(prev)
      if (istFavorit) next.delete(baustelleId)
      else next.add(baustelleId)
      return next
    })
    if (istFavorit) {
      await supabase.from('favoriten').delete().eq('user_id', user.id).eq('baustelle_id', baustelleId)
    } else {
      await supabase.from('favoriten').insert({ user_id: user.id, baustelle_id: baustelleId })
    }
  }

  const sortiert = [...baustellen].sort((a, b) => {
    const aFav = favoritenIds.has(a.id) ? 1 : 0
    const bFav = favoritenIds.has(b.id) ? 1 : 0
    return bFav - aFav
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Projekte</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Abbrechen' : '+ Neues Projekt'}
        </button>
      </div>

      {fehler && (
        <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          Fehler: {fehler}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="z. B. Neubau Mehrfamilienhaus Musterstraße 12"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Adresse</label>
            <input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Speichert…' : 'Projekt anlegen'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : sortiert.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Projekte angelegt.</p>
      ) : (
        <ul className="space-y-2">
          {sortiert.map((b) => (
            <li key={b.id} className="flex items-center gap-2">
              <button
                onClick={() => toggleFavorit(b.id)}
                aria-label={favoritenIds.has(b.id) ? 'Favorit entfernen' : 'Als Favorit markieren'}
                className="flex-shrink-0 text-xl leading-none text-amber-500"
              >
                {favoritenIds.has(b.id) ? '★' : '☆'}
              </button>
              <Link
                to={`/baustellen/${b.id}`}
                className="block flex-1 rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div className="font-medium text-gray-900">{b.name}</div>
                {b.adresse && <div className="text-sm text-gray-500">{b.adresse}</div>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
