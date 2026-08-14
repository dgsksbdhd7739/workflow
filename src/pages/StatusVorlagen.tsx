import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { StatusVorlage, StatusVorlageWert } from '../types/database'

const farbPalette = ['#dc2626', '#ea580c', '#f59e0b', '#eab308', '#16a34a', '#2563eb', '#9333ea', '#d946ef', '#000000', '#6b7280']

export function StatusVorlagen() {
  const { user } = useAuth()
  const [vorlagen, setVorlagen] = useState<StatusVorlage[]>([])
  const [werte, setWerte] = useState<StatusVorlageWert[]>([])
  const [ausgewaehlteVorlage, setAusgewaehlteVorlage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [neueVorlageName, setNeueVorlageName] = useState('')
  const [vorlageFormOffen, setVorlageFormOffen] = useState(false)

  const [neuerWertTitel, setNeuerWertTitel] = useState('')
  const [neuerWertFarbe, setNeuerWertFarbe] = useState(farbPalette[0])

  const loadVorlagen = async () => {
    setLoading(true)
    const { data } = await supabase.from('statusvorlagen').select('*').order('erstellt_am')
    setVorlagen(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadVorlagen()
  }, [])

  const loadWerte = async (vorlageId: string) => {
    const { data } = await supabase
      .from('statusvorlage_werte')
      .select('*')
      .eq('statusvorlage_id', vorlageId)
      .order('reihenfolge')
    setWerte(data ?? [])
  }

  useEffect(() => {
    if (ausgewaehlteVorlage) loadWerte(ausgewaehlteVorlage)
    else setWerte([])
  }, [ausgewaehlteVorlage])

  const handleCreateVorlage = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !neueVorlageName.trim()) return
    const { data } = await supabase
      .from('statusvorlagen')
      .insert({ name: neueVorlageName.trim(), erstellt_von: user.id })
      .select()
      .single()
    setNeueVorlageName('')
    setVorlageFormOffen(false)
    await loadVorlagen()
    if (data) setAusgewaehlteVorlage(data.id)
  }

  const handleDeleteVorlage = async (id: string) => {
    if (ausgewaehlteVorlage === id) setAusgewaehlteVorlage(null)
    setVorlagen((prev) => prev.filter((v) => v.id !== id))
    await supabase.from('statusvorlagen').delete().eq('id', id)
  }

  const handleAddWert = async (e: FormEvent) => {
    e.preventDefault()
    if (!ausgewaehlteVorlage || !neuerWertTitel.trim()) return
    const reihenfolge = werte.length > 0 ? Math.max(...werte.map((w) => w.reihenfolge)) + 1 : 1
    await supabase.from('statusvorlage_werte').insert({
      statusvorlage_id: ausgewaehlteVorlage,
      titel: neuerWertTitel.trim(),
      farbe: neuerWertFarbe,
      reihenfolge,
      ist_standard: werte.length === 0,
    })
    setNeuerWertTitel('')
    loadWerte(ausgewaehlteVorlage)
  }

  const moveWert = async (index: number, richtung: -1 | 1) => {
    if (!ausgewaehlteVorlage) return
    const zielIndex = index + richtung
    if (zielIndex < 0 || zielIndex >= werte.length) return
    const a = werte[index]
    const b = werte[zielIndex]
    setWerte((prev) => {
      const next = [...prev]
      ;[next[index], next[zielIndex]] = [next[zielIndex], next[index]]
      return next
    })
    await Promise.all([
      supabase.from('statusvorlage_werte').update({ reihenfolge: b.reihenfolge }).eq('id', a.id),
      supabase.from('statusvorlage_werte').update({ reihenfolge: a.reihenfolge }).eq('id', b.id),
    ])
  }

  const setStandard = async (wertId: string) => {
    if (!ausgewaehlteVorlage) return
    setWerte((prev) => prev.map((w) => ({ ...w, ist_standard: w.id === wertId })))
    await supabase.from('statusvorlage_werte').update({ ist_standard: false }).eq('statusvorlage_id', ausgewaehlteVorlage)
    await supabase.from('statusvorlage_werte').update({ ist_standard: true }).eq('id', wertId)
  }

  const deleteWert = async (wertId: string) => {
    setWerte((prev) => prev.filter((w) => w.id !== wertId))
    await supabase.from('statusvorlage_werte').delete().eq('id', wertId)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Statusvorlagen</h1>
          <p className="text-xs text-gray-500">
            Eigene Statuswerte mit Farbe definieren, z. B. je Gewerk. Einem Plan zuweisbar.
          </p>
        </div>
        <button
          onClick={() => setVorlageFormOffen((v) => !v)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {vorlageFormOffen ? 'Abbrechen' : '+ Vorlage'}
        </button>
      </div>

      {vorlageFormOffen && (
        <form onSubmit={handleCreateVorlage} className="mb-4 flex gap-2">
          <input
            autoFocus
            value={neueVorlageName}
            onChange={(e) => setNeueVorlageName(e.target.value)}
            placeholder="z. B. Elektroinstallation"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Anlegen
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : vorlagen.length === 0 ? (
        <p className="text-sm text-gray-500">Noch keine Statusvorlagen angelegt.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {vorlagen.map((v) => (
            <div key={v.id} className="flex items-center">
              <button
                onClick={() => setAusgewaehlteVorlage(v.id)}
                className={`rounded-l-full border px-3 py-1 text-xs font-medium ${
                  ausgewaehlteVorlage === v.id
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-300 text-gray-600'
                }`}
              >
                {v.name}
              </button>
              <button
                onClick={() => handleDeleteVorlage(v.id)}
                className={`rounded-r-full border border-l-0 px-2 py-1 text-xs ${
                  ausgewaehlteVorlage === v.id ? 'border-blue-600 text-blue-400' : 'border-gray-300 text-gray-400'
                }`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {ausgewaehlteVorlage && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          {werte.length === 0 ? (
            <p className="mb-3 text-sm text-gray-500">Noch keine Statuswerte in dieser Vorlage.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {werte.map((w, i) => (
                <li key={w.id} className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveWert(i, -1)}
                      disabled={i === 0}
                      className="leading-none text-gray-400 disabled:opacity-20"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveWert(i, 1)}
                      disabled={i === werte.length - 1}
                      className="leading-none text-gray-400 disabled:opacity-20"
                    >
                      ▼
                    </button>
                  </div>
                  <span style={{ backgroundColor: w.farbe }} className="h-4 w-4 flex-shrink-0 rounded-full" />
                  <span className="flex-1 truncate text-sm text-gray-900">{w.titel}</span>
                  <button
                    onClick={() => setStandard(w.id)}
                    className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                      w.ist_standard ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-500'
                    }`}
                  >
                    {w.ist_standard ? 'Standard' : 'Als Standard'}
                  </button>
                  <button onClick={() => deleteWert(w.id)} className="flex-shrink-0 text-xs text-gray-400 hover:text-red-600">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddWert} className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <input
              value={neuerWertTitel}
              onChange={(e) => setNeuerWertTitel(e.target.value)}
              placeholder="z. B. Grobinstallation fertig"
              className="min-w-[10rem] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-1.5">
              {farbPalette.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setNeuerWertFarbe(c)}
                  style={{ backgroundColor: c }}
                  className={`h-5 w-5 rounded-full ${neuerWertFarbe === c ? 'ring-2 ring-offset-1 ring-gray-900' : ''}`}
                />
              ))}
            </div>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Hinzufügen
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
