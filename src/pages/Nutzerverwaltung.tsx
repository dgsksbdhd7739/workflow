import { useEffect, useState, type FormEvent } from 'react'
import { supabase, funktionsFehler } from '../lib/supabase'
import { PaketHinweis } from '../components/PaketSperre'
import { useAuth } from '../contexts/AuthContext'
import type { Projekt, Profile, Rolle } from '../types/database'

function useMaxNutzer(unternehmenId: string | null) {
  const [maxNutzer, setMaxNutzer] = useState<number | null>(null)
  useEffect(() => {
    if (!unternehmenId) return
    supabase
      .from('unternehmen')
      .select('max_nutzer')
      .eq('id', unternehmenId)
      .single()
      .then(({ data }) => setMaxNutzer(data?.max_nutzer ?? null))
  }, [unternehmenId])
  return maxNutzer
}

const rollenLabel: Record<Rolle, string> = {
  admin: 'Admin',
  planer: 'Planer',
  techniker: 'Techniker',
  kunde: 'Kunde (Zuschauer)',
}

const sperrbareModule = [
  { id: 'material', label: 'Material' },
  { id: 'dokumente', label: 'Dokumente' },
  { id: 'tagesberichte', label: 'Tagesberichte' },
  { id: 'termine', label: 'Termine' },
]

export function Nutzerverwaltung() {
  const { role, user, unternehmenId, istPlattformAdmin, hatFunktion } = useAuth()
  const kundenErlaubt = hatFunktion('kunden')
  const modulsperrenErlaubt = hatFunktion('modulsperren')
  const maxNutzer = useMaxNutzer(unternehmenId)
  const [profile, setProfile] = useState<Profile[]>([])
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [zuweisungen, setZuweisungen] = useState<Record<string, Set<string>>>({})
  const [modulSperren, setModulSperren] = useState<Record<string, Set<string>>>({})
  const [offenerNutzerModule, setOffenerNutzerModule] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [offenerNutzer, setOffenerNutzer] = useState<string | null>(null)

  const [formOffen, setFormOffen] = useState(false)
  const [neuEmail, setNeuEmail] = useState('')
  const [neuPasswort, setNeuPasswort] = useState('abcd.1234')
  const [neuName, setNeuName] = useState('')
  const [neuRolle, setNeuRolle] = useState<Rolle>('techniker')
  const [anlegen, setAnlegen] = useState(false)

  const [pwResetOffen, setPwResetOffen] = useState<string | null>(null)
  const [neuesPasswort, setNeuesPasswort] = useState('abcd.1234')
  const [aktionLaeuft, setAktionLaeuft] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [{ data: profileData }, { data: projekteData }, { data: zuweisungenData }, { data: sperrenData }] =
      await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('projekte').select('*').order('name'),
        supabase.from('projekt_kunden').select('user_id, projekt_id'),
        supabase.from('nutzer_modul_sperren').select('user_id, modul'),
      ])
    setProfile(profileData ?? [])
    setProjekte(projekteData ?? [])
    const map: Record<string, Set<string>> = {}
    for (const z of zuweisungenData ?? []) {
      if (!map[z.user_id]) map[z.user_id] = new Set()
      map[z.user_id].add(z.projekt_id)
    }
    setZuweisungen(map)
    const sperrenMap: Record<string, Set<string>> = {}
    for (const s of sperrenData ?? []) {
      if (!sperrenMap[s.user_id]) sperrenMap[s.user_id] = new Set()
      sperrenMap[s.user_id].add(s.modul)
    }
    setModulSperren(sperrenMap)
    setLoading(false)
  }

  useEffect(() => {
    if (role === 'admin') load()
  }, [role])

  // Plattform-Admins gehoeren nicht zur Firma (RLS blendet sie fuer andere aus,
  // Migration 0058) -- nur das eigene Profil waere hier sonst noch sichtbar.
  const sichtbareProfile = profile.filter((p) => !(istPlattformAdmin && p.id === user?.id))

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
      setFehler((await funktionsFehler(error, data)) ?? 'Nutzer konnte nicht angelegt werden.')
      return
    }
    setNeuEmail('')
    setNeuPasswort('abcd.1234')
    setNeuName('')
    setNeuRolle('techniker')
    setFormOffen(false)
    load()
  }

  const handleResetPassword = async (e: FormEvent, profileId: string) => {
    e.preventDefault()
    setFehler(null)
    setAktionLaeuft(profileId)
    const { data, error } = await supabase.functions.invoke('reset-user-password', {
      body: { user_id: profileId, password: neuesPasswort },
    })
    setAktionLaeuft(null)
    if (error || data?.error) {
      setFehler((await funktionsFehler(error, data)) ?? 'Passwort konnte nicht zurückgesetzt werden.')
      return
    }
    setPwResetOffen(null)
    setNeuesPasswort('abcd.1234')
  }

  const handleToggleAktiv = async (profileId: string, aktivSetzen: boolean) => {
    setFehler(null)
    if (
      !aktivSetzen &&
      !window.confirm('Nutzer wirklich deaktivieren? Er kann sich danach nicht mehr anmelden, bleibt aber in allen Datensätzen erhalten.')
    ) {
      return
    }
    setAktionLaeuft(profileId)
    const { data, error } = await supabase.functions.invoke('set-user-active', {
      body: { user_id: profileId, aktiv: aktivSetzen },
    })
    setAktionLaeuft(null)
    if (error || data?.error) {
      setFehler((await funktionsFehler(error, data)) ?? 'Status konnte nicht geändert werden.')
      return
    }
    load()
  }

  const handleDeleteUser = async (profileId: string) => {
    setFehler(null)
    if (!window.confirm('Nutzer wirklich unwiderruflich löschen?')) return
    setAktionLaeuft(profileId)
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { user_id: profileId },
    })
    setAktionLaeuft(null)
    if (error || data?.error) {
      setFehler((await funktionsFehler(error, data)) ?? 'Nutzer konnte nicht gelöscht werden.')
      return
    }
    load()
  }

  const toggleProjektZugriff = async (userId: string, projektId: string) => {
    setFehler(null)
    const hatZugriff = zuweisungen[userId]?.has(projektId) ?? false
    setZuweisungen((prev) => {
      const next = { ...prev, [userId]: new Set(prev[userId] ?? []) }
      if (hatZugriff) next[userId].delete(projektId)
      else next[userId].add(projektId)
      return next
    })
    const { error } = hatZugriff
      ? await supabase.from('projekt_kunden').delete().eq('user_id', userId).eq('projekt_id', projektId)
      : await supabase.from('projekt_kunden').insert({ user_id: userId, projekt_id: projektId })
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const toggleModulSperre = async (userId: string, modul: string) => {
    setFehler(null)
    const gesperrt = modulSperren[userId]?.has(modul) ?? false
    setModulSperren((prev) => {
      const next = { ...prev, [userId]: new Set(prev[userId] ?? []) }
      if (gesperrt) next[userId].delete(modul)
      else next[userId].add(modul)
      return next
    })
    const { error } = gesperrt
      ? await supabase.from('nutzer_modul_sperren').delete().eq('user_id', userId).eq('modul', modul)
      : await supabase.from('nutzer_modul_sperren').insert({ user_id: userId, modul, gesperrt_von: user?.id })
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  if (role && role !== 'admin') {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — nur Admins können Nutzerrollen verwalten.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Nutzerverwaltung</h1>
          <p className="text-xs text-text-muted">
            Rollen steuern, was ein Nutzer sehen und bearbeiten darf. Admin: alles. Planer: fast alles außer
            Nutzerverwaltung. Techniker: Projektarbeit inkl. Zeiterfassung. Kunde: nur lesen, keine
            Zeiterfassung — und nur für ausdrücklich zugewiesene Projekte.
          </p>
          {maxNutzer != null && (
            <p className="mt-1 text-xs font-medium text-text-subtle">
              {sichtbareProfile.length} / {maxNutzer} Nutzern belegt
            </p>
          )}
        </div>
        <button onClick={() => setFormOffen((v) => !v)} className="btn-primary flex-shrink-0">
          {formOffen ? 'Abbrechen' : '+ Nutzer anlegen'}
        </button>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {formOffen && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3 p-4">
          <div>
            <label className="field-label">Name</label>
            <input
              value={neuName}
              onChange={(e) => setNeuName(e.target.value)}
              className="field-input"
              placeholder="Vor- und Nachname"
            />
          </div>
          <div>
            <label className="field-label">E-Mail</label>
            <input
              type="email"
              required
              value={neuEmail}
              onChange={(e) => setNeuEmail(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Passwort</label>
            <input
              type="text"
              required
              minLength={6}
              value={neuPasswort}
              onChange={(e) => setNeuPasswort(e.target.value)}
              className="field-input"
              placeholder="Mindestens 6 Zeichen"
            />
          </div>
          <div>
            <label className="field-label">Rolle</label>
            <select
              value={neuRolle}
              onChange={(e) => setNeuRolle(e.target.value as Rolle)}
              className="field-input"
            >
              {(Object.keys(rollenLabel) as Rolle[]).map((r) => (
                <option key={r} value={r} disabled={r === 'kunde' && !kundenErlaubt}>
                  {rollenLabel[r]}
                  {r === 'kunde' && !kundenErlaubt && ' (ab Team-Paket)'}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={anlegen} className="btn-primary">
            {anlegen ? 'Legt an…' : 'Nutzer anlegen'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : (
        <ul className="space-y-2">
          {sichtbareProfile.map((p) => (
            <li key={p.id} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-text">{p.full_name || '—'}</div>
                    {p.deaktiviert && (
                      <span className="flex-shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
                        Deaktiviert
                      </span>
                    )}
                  </div>
                  {p.id === user?.id && <div className="text-xs text-text-subtle">Das bist du</div>}
                </div>
                <select
                  value={p.role}
                  onChange={(e) => updateRolle(p.id, e.target.value as Rolle)}
                  className="flex-shrink-0 rounded-lg border border-border-strong bg-surface px-2 py-1 text-sm text-text"
                >
                  {(Object.keys(rollenLabel) as Rolle[]).map((r) => (
                    <option key={r} value={r} disabled={r === 'kunde' && !kundenErlaubt && p.role !== 'kunde'}>
                      {rollenLabel[r]}
                      {r === 'kunde' && !kundenErlaubt && ' (ab Team-Paket)'}
                    </option>
                  ))}
                </select>
              </div>

              {p.id !== user?.id && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      setPwResetOffen((prev) => (prev === p.id ? null : p.id))
                      setNeuesPasswort('abcd.1234')
                    }}
                    className="text-brand"
                  >
                    {pwResetOffen === p.id ? 'Abbrechen' : 'Passwort zurücksetzen'}
                  </button>
                  <button
                    type="button"
                    disabled={aktionLaeuft === p.id}
                    onClick={() => handleToggleAktiv(p.id, Boolean(p.deaktiviert))}
                    className="text-text-muted disabled:opacity-50"
                  >
                    {p.deaktiviert ? 'Aktivieren' : 'Deaktivieren'}
                  </button>
                  <button
                    type="button"
                    disabled={aktionLaeuft === p.id}
                    onClick={() => handleDeleteUser(p.id)}
                    className="text-red-600 disabled:opacity-50 dark:text-red-400"
                  >
                    Löschen
                  </button>
                </div>
              )}

              {pwResetOffen === p.id && (
                <form onSubmit={(e) => handleResetPassword(e, p.id)} className="mt-2 flex items-end gap-2 border-t border-border pt-2">
                  <div className="flex-1">
                    <label className="field-label">Neues Passwort</label>
                    <input
                      type="text"
                      required
                      minLength={6}
                      value={neuesPasswort}
                      onChange={(e) => setNeuesPasswort(e.target.value)}
                      className="field-input"
                      placeholder="Mindestens 6 Zeichen"
                    />
                  </div>
                  <button type="submit" disabled={aktionLaeuft === p.id} className="btn-primary flex-shrink-0">
                    {aktionLaeuft === p.id ? 'Setzt…' : 'Setzen'}
                  </button>
                </form>
              )}

              {p.role === 'kunde' && (
                <>
                  <button
                    onClick={() => setOffenerNutzer((prev) => (prev === p.id ? null : p.id))}
                    className="mt-2 text-xs font-medium text-brand"
                  >
                    {offenerNutzer === p.id
                      ? 'Projekte ausblenden'
                      : `Zugewiesene Projekte (${zuweisungen[p.id]?.size ?? 0})`}
                  </button>
                  {offenerNutzer === p.id && (
                    <div className="mt-2 space-y-1 border-t border-border pt-2">
                      {projekte.length === 0 ? (
                        <p className="text-xs text-text-subtle">Noch keine Projekte angelegt.</p>
                      ) : (
                        projekte.map((b) => (
                          <label key={b.id} className="flex items-center gap-2 text-sm text-text-muted">
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

              {!modulsperrenErlaubt && (
                <div className="mt-2">
                  <PaketHinweis funktion="modulsperren" kompakt />
                </div>
              )}
              {modulsperrenErlaubt && (
              <button
                onClick={() => setOffenerNutzerModule((prev) => (prev === p.id ? null : p.id))}
                className="mt-2 text-xs font-medium text-brand"
              >
                {offenerNutzerModule === p.id
                  ? 'Modul-Zugriff ausblenden'
                  : `Modul-Zugriff einschränken (${modulSperren[p.id]?.size ?? 0} gesperrt)`}
              </button>
              )}
              {offenerNutzerModule === p.id && modulsperrenErlaubt && (
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                  <p className="text-xs text-text-subtle">
                    Angehakte Module bleiben für diese Person zugänglich, unabhängig von der Rolle oben.
                  </p>
                  {sperrbareModule.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm text-text-muted">
                      <input
                        type="checkbox"
                        checked={!(modulSperren[p.id]?.has(m.id) ?? false)}
                        onChange={() => toggleModulSperre(p.id, m.id)}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
