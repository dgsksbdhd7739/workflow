import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Baustelle } from '../types/database'

export function Dashboard() {
  const { user } = useAuth()
  const [baustellen, setBaustellen] = useState<Baustelle[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [adresse, setAdresse] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('baustellen')
      .select('*')
      .order('created_at', { ascending: false })
    setBaustellen(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    await supabase.from('baustellen').insert({ name, adresse, created_by: user.id })
    setSaving(false)
    setName('')
    setAdresse('')
    setShowForm(false)
    load()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Baustellen</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Abbrechen' : '+ Neue Baustelle'}
        </button>
      </div>

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
            {saving ? 'Speichert…' : 'Baustelle anlegen'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : baustellen.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Baustellen angelegt.</p>
      ) : (
        <ul className="space-y-2">
          {baustellen.map((b) => (
            <li key={b.id}>
              <Link
                to={`/baustellen/${b.id}/maengel`}
                className="block rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50/40"
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
