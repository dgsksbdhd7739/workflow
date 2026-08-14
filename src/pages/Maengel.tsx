import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import type { Mangel, MangelPrioritaet, MangelStatus } from '../types/database'

const statusLabel: Record<MangelStatus, string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  erledigt: 'Erledigt',
}

const statusColor: Record<MangelStatus, string> = {
  offen: 'bg-red-100 text-red-700',
  in_bearbeitung: 'bg-amber-100 text-amber-700',
  erledigt: 'bg-green-100 text-green-700',
}

const prioritaetLabel: Record<MangelPrioritaet, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
}

export function Maengel() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { profiles, nameOf } = useProfiles()
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<MangelStatus | 'alle'>('alle')

  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [prioritaet, setPrioritaet] = useState<MangelPrioritaet>('mittel')
  const [verantwortlicherId, setVerantwortlicherId] = useState('')
  const [faelligAm, setFaelligAm] = useState('')
  const [foto, setFoto] = useState<File | null>(null)

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const { data } = await supabase
      .from('maengel')
      .select('*')
      .eq('baustelle_id', baustelleId)
      .order('erstellt_am', { ascending: false })
    setMaengel(data ?? [])
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

    let foto_url: string | null = null
    if (foto) {
      const path = `${baustelleId}/${Date.now()}-${foto.name}`
      const { error: uploadError } = await supabase.storage.from('mangel-fotos').upload(path, foto)
      if (!uploadError) {
        foto_url = supabase.storage.from('mangel-fotos').getPublicUrl(path).data.publicUrl
      }
    }

    await supabase.from('maengel').insert({
      baustelle_id: baustelleId,
      titel,
      beschreibung: beschreibung || null,
      prioritaet,
      verantwortlicher_id: verantwortlicherId || null,
      faellig_am: faelligAm || null,
      foto_url,
      erstellt_von: user.id,
    })

    setSaving(false)
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
    setMaengel((prev) => prev.map((m) => (m.id === mangelId ? { ...m, status } : m)))
    await supabase.from('maengel').update({ status }).eq('id', mangelId)
  }

  const gefiltert = filterStatus === 'alle' ? maengel : maengel.filter((m) => m.status === filterStatus)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Mängel</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {showForm ? 'Abbrechen' : '+ Mangel melden'}
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {(['alle', 'offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filterStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {s === 'alle' ? 'Alle' : statusLabel[s]}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Titel</label>
            <input
              required
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="z. B. Riss in der Kellerwand"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Beschreibung</label>
            <textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Priorität</label>
              <select
                value={prioritaet}
                onChange={(e) => setPrioritaet(e.target.value as MangelPrioritaet)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {(['niedrig', 'mittel', 'hoch'] as const).map((p) => (
                  <option key={p} value={p}>
                    {prioritaetLabel[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fällig am</label>
              <input
                type="date"
                value={faelligAm}
                onChange={(e) => setFaelligAm(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Verantwortlich</label>
            <select
              value={verantwortlicherId}
              onChange={(e) => setVerantwortlicherId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
            <label className="mb-1 block text-sm font-medium text-gray-700">Foto</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Speichert…' : 'Mangel speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : gefiltert.length === 0 ? (
        <p className="text-sm text-gray-500">Keine Mängel in dieser Ansicht.</p>
      ) : (
        <ul className="space-y-3">
          {gefiltert.map((m) => (
            <li key={m.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{m.titel}</div>
                  {m.beschreibung && <div className="mt-1 text-sm text-gray-600">{m.beschreibung}</div>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>Priorität: {prioritaetLabel[m.prioritaet]}</span>
                    <span>Verantwortlich: {nameOf(m.verantwortlicher_id)}</span>
                    {m.faellig_am && <span>Fällig: {m.faellig_am}</span>}
                  </div>
                </div>
                {m.foto_url && (
                  <img src={m.foto_url} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[m.status]}`}>
                  {statusLabel[m.status]}
                </span>
                <select
                  value={m.status}
                  onChange={(e) => updateStatus(m.id, e.target.value as MangelStatus)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                >
                  {(['offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </select>
              </div>
              {m.plan_id && (
                <Link
                  to={`/baustellen/${baustelleId}/plaene/${m.plan_id}`}
                  className="mt-2 inline-block text-xs text-blue-600"
                >
                  📍 Position auf Plan ansehen
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
