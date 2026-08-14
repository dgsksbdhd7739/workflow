import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Profile, Rolle } from '../types/database'

const rollenLabel: Record<Rolle, string> = {
  admin: 'Admin',
  planer: 'Planer',
  techniker: 'Techniker',
  kunde: 'Kunde (Zuschauer)',
}

export function Nutzerverwaltung() {
  const { role, user } = useAuth()
  const [profile, setProfile] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfile(data ?? [])
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

  if (role && role !== 'admin') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-sm text-gray-500">Kein Zugriff — nur Admins können Nutzerrollen verwalten.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Nutzerverwaltung</h1>
        <p className="text-xs text-gray-500">
          Rollen steuern, was ein Nutzer sehen und bearbeiten darf. Admin: alles. Planer: fast alles außer
          Nutzerverwaltung. Techniker: Baustellenarbeit ohne Kalkulation. Kunde: nur lesen, keine Kalkulation/Zeiterfassung.
        </p>
      </div>

      {fehler && (
        <p className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          Fehler: {fehler}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : (
        <ul className="space-y-2">
          {profile.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4"
            >
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
