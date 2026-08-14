import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Baustelle, Profile, Rolle } from '../types/database'

const rollenLabel: Record<Rolle, string> = {
  admin: 'Admin',
  planer: 'Planer',
  techniker: 'Techniker',
  kunde: 'Kunde (Zuschauer)',
}

export function Nutzerverwaltung() {
  const { role, user } = useAuth()
  const [profile, setProfile] = useState<Profile[]>([])
  const [baustellen, setBaustellen] = useState<Baustelle[]>([])
  const [zuweisungen, setZuweisungen] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [offenerNutzer, setOffenerNutzer] = useState<string | null>(null)

  const [formOffen, setFormOffen] = useState(false)
  const [neuEmail, setNeuEmail] = useState('')
  const [neuPasswort, setNeuPasswort] = useState('abcd.1234')
  const [neuName, setNeuName] = useState('')
  const [neuRolle, setNeuRolle] = useState<Rolle>('techniker')
  const [anlegen, setAnlegen] = useState(false)

  const load = async () => {
    setLoading(true)
    const [{ data: profileData }, { data: baustellenData }, { data: zuweisungenData }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('baustellen').select('*').order('name'),
      supabase.from('baustelle_kunden').select('user_id, baustelle_id'),
    ])
    setProfile(profileData ?? [])
    setBaustellen(baustellenData ?? [])
    const map: Record<string, Set<string>> = {}
    for (const z of zuweisungenData ?? []) {
      if (!map[z.user_id]) map[z.user_id] = new Set()
      map[z.user_id].add(z.baustelle_id)
    }
    setZuweisungen(map)
    setLoading(false)
  }

  useEffect(() => {
    if (role === 'admin') load()
  }, [role])

  const updateRolle = async (profileId: string, neueRolle: Rolle) => {
    setFehler(null)
    setProfile((prev) => prev.map((p) => (p.id === profileId ? { ...p, role: neueRolle } : p)))
    const { error } = await supabase.from('profiles').update({ role: neueRolle }).eq('id', profileId)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setAnlegen(true)
    setFehler(null)
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { email: neuEmail, password: neuPasswort, full_name: neuName, role: neuRolle },
    })
    setAnlegen(false)
    if (error || data?.error) {
      setFehler(data?.error ?? error?.message ?? 'Nutzer konnte nicht angelegt werden.')
      return
    }
    setNeuEmail('')
    setNeuPasswort('abcd.1234')
    setNeuName('')
    setNeuRolle('techniker')
    setFormOffen(false)
    load()
  }

  const toggleProjektZugriff = async (userId: string, baustelleId: string) => {
    setFehler(null)
    const hatZugriff = zuweisungen[userId]?.has(baustelleId) ?? false
    setZuweisungen((prev) => {
      const next = { ...prev, [userId]: new Set(prev[userId] ?? []) }
      if (hatZugriff) next[userId].delete(baustelleId)
      else next[userId].add(baustelleId)
      return next
    })
    const { error } = hatZugriff
      ? await supabase.from('baustelle_kunden').delete().eq('user_id', userId).eq('baustelle_id', baustelleId)
      : await supabase.from('baustelle_kunden').insert({ user_id: userId, baustelle_id: baustelleId })
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  if (role && role !== 'admin') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-gray-500">Kein Zugriff — nur Admins können Nutzerrollen verwalten.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Nutzerverwaltung</h1>
          <p className="text-xs text-gray-500">
            Rollen steuern, was ein Nutzer sehen und bearbeiten darf. Admin: alles. Planer: fast alles außer
            Nutzerverwaltung. Techniker: Baustellenarbeit ohne Kalkulation. Kunde: nur lesen, keine
            Kalkulation/Zeiterfassung — und nur für ausdrücklich zugewiesene Projekte.
          </p>
        </div>
        <button
          onClick={() => setFormOffen((v) => !v)}
          className="flex-shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {formOffen ? 'Abbrechen' : '+ Nutzer anlegen'}
        </button>
      </div>

      {fehler && (
        <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          Fehler: {fehler}
        </p>
      )}

      {formOffen && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              value={neuName}
              onChange={(e) => setNeuName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Vor- und Nachname"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">E-Mail</label>
            <input
              type="email"
              required
              value={neuEmail}
              onChange={(e) => setNeuEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Passwort</label>
            <input
              type="text"
              required
              minLength={6}
              value={neuPasswort}
              onChange={(e) => setNeuPasswort(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Mindestens 6 Zeichen"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Rolle</label>
            <select
              value={neuRolle}
              onChange={(e) => setNeuRolle(e.target.value as Rolle)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {(Object.keys(rollenLabel) as Rolle[]).map((r) => (
                <option key={r} value={r}>
                  {rollenLabel[r]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={anlegen}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {anlegen ? 'Legt an…' : 'Nutzer anlegen'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : (
        <ul className="space-y-2">
          {profile.map((p) => (
            <li key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900">{p.full_name || '—'}</div>
                  {p.id === user?.id && <div className="text-xs text-gray-400">Das bist du</div>}
                </div>
                <select
                  value={p.role}
                  onChange={(e) => updateRolle(p.id, e.target.value as Rolle)}
                  className="flex-shrink-0 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                >
                  {(Object.keys(rollenLabel) as Rolle[]).map((r) => (
                    <option key={r} value={r}>
                      {rollenLabel[r]}
                    </option>
                  ))}
                </select>
              </div>

              {p.role === 'kunde' && (
                <>
                  <button
                    onClick={() => setOffenerNutzer((prev) => (prev === p.id ? null : p.id))}
                    className="mt-2 text-xs font-medium text-blue-600"
                  >
                    {offenerNutzer === p.id
                      ? 'Projekte ausblenden'
                      : `Zugewiesene Projekte (${zuweisungen[p.id]?.size ?? 0})`}
                  </button>
                  {offenerNutzer === p.id && (
                    <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                      {baustellen.length === 0 ? (
                        <p className="text-xs text-gray-400">Noch keine Projekte angelegt.</p>
                      ) : (
                        baustellen.map((b) => (
                          <label key={b.id} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={zuweisungen[p.id]?.has(b.id) ?? false}
                              onChange={() => toggleProjektZugriff(p.id, b.id)}
                            />
                            {b.name}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
