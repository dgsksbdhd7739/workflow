import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { StatusVorlage, StatusVorlageWert } from '../types/database'

const farbPalette = ['#dc2626', '#ea580c', '#f59e0b', '#eab308', '#16a34a', '#2563eb', '#9333ea', '#d946ef', '#000000', '#6b7280']

export function StatusVorlagen() {
  const { user, role } = useAuth()
  const [vorlagen, setVorlagen] = useState<StatusVorlage[]>([])
  const [werte, setWerte] = useState<StatusVorlageWert[]>([])
  const [ausgewaehlteVorlage, setAusgewaehlteVorlage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [neueVorlageName, setNeueVorlageName] = useState('')
  const [vorlageFormOffen, setVorlageFormOffen] = useState(false)

  const [neuerWertTitel, setNeuerWertTitel] = useState('')
  const [neuerWertFarbe, setNeuerWertFarbe] = useState(farbPalette[0])
  const [fehler, setFehler] = useState<string | null>(null)

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
    setFehler(null)
    const { data, error } = await supabase
      .from('statusvorlagen')
      .insert({ name: neueVorlageName.trim(), erstellt_von: user.id })
      .select()
      .single()
    if (error) {
      setFehler(error.message)
      return
    }
    setNeueVorlageName('')
    setVorlageFormOffen(false)
    await loadVorlagen()
    if (data) setAusgewaehlteVorlage(data.id)
  }

  const handleDeleteVorlage = async (id: string) => {
    if (!window.confirm('Diese Vorlage inklusive aller Statuswerte wirklich löschen?')) return
    setFehler(null)
    if (ausgewaehlteVorlage === id) setAusgewaehlteVorlage(null)
    setVorlagen((prev) => prev.filter((v) => v.id !== id))
    const { error } = await supabase.from('statusvorlagen').delete().eq('id', id)
    if (error) {
      setFehler(error.message)
      loadVorlagen()
    }
  }

  const handleAddWert = async (e: FormEvent) => {
    e.preventDefault()
    if (!ausgewaehlteVorlage || !neuerWertTitel.trim()) return
    setFehler(null)
    const reihenfolge = werte.length > 0 ? Math.max(...werte.map((w) => w.reihenfolge)) + 1 : 1
    const { error } = await supabase.from('statusvorlage_werte').insert({
      statusvorlage_id: ausgewaehlteVorlage,
      titel: neuerWertTitel.trim(),
      farbe: neuerWertFarbe,
      reihenfolge,
      ist_standard: werte.length === 0,
    })
    if (error) {
      setFehler(error.message)
      return
    }
    setNeuerWertTitel('')
    loadWerte(ausgewaehlteVorlage)
  }

  const moveWert = async (index: number, richtung: -1 | 1) => {
    if (!ausgewaehlteVorlage) return
    const zielIndex = index + richtung
    if (zielIndex < 0 || zielIndex >= werte.length) return
    setFehler(null)
    const a = werte[index]
    const b = werte[zielIndex]
    setWerte((prev) => {
      const next = [...prev]
      ;[next[index], next[zielIndex]] = [next[zielIndex], next[index]]
      return next
    })
    const [r1, r2] = await Promise.all([
      supabase.from('statusvorlage_werte').update({ reihenfolge: b.reihenfolge }).eq('id', a.id),
      supabase.from('statusvorlage_werte').update({ reihenfolge: a.reihenfolge }).eq('id', b.id),
    ])
    if (r1.error || r2.error) {
      setFehler((r1.error ?? r2.error)!.message)
      loadWerte(ausgewaehlteVorlage)
    }
  }

  const setStandard = async (wertId: string) => {
    if (!ausgewaehlteVorlage) return
    setFehler(null)
    setWerte((prev) => prev.map((w) => ({ ...w, ist_standard: w.id === wertId })))
    const r1 = await supabase.from('statusvorlage_werte').update({ ist_standard: false }).eq('statusvorlage_id', ausgewaehlteVorlage)
    const r2 = await supabase.from('statusvorlage_werte').update({ ist_standard: true }).eq('id', wertId)
    if (r1.error || r2.error) {
      setFehler((r1.error ?? r2.error)!.message)
      loadWerte(ausgewaehlteVorlage)
    }
  }

  const deleteWert = async (wertId: string) => {
    if (!ausgewaehlteVorlage) return
    if (!window.confirm('Diesen Statuswert wirklich löschen?')) return
    setFehler(null)
    setWerte((prev) => prev.filter((w) => w.id !== wertId))
    const { error } = await supabase.from('statusvorlage_werte').delete().eq('id', wertId)
    if (error) {
      setFehler(error.message)
      loadWerte(ausgewaehlteVorlage)
    }
  }

  if (role && role !== 'admin' && role !== 'planer') {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — Statusvorlagen sind Admin und Planer vorbehalten.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Statusvorlagen</h1>
          <p className="text-xs text-text-muted">
            Eigene Statuswerte mit Farbe definieren, z. B. je Gewerk. Einem Plan zuweisbar.
          </p>
        </div>
        <button onClick={() => setVorlageFormOffen((v) => !v)} className="btn-primary">
          {vorlageFormOffen ? 'Abbrechen' : '+ Vorlage'}
        </button>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {vorlageFormOffen && (
        <form onSubmit={handleCreateVorlage} className="mb-4 flex gap-2">
          <input
            autoFocus
            value={neueVorlageName}
            onChange={(e) => setNeueVorlageName(e.target.value)}
            placeholder="z. B. Elektroinstallation"
            className="field-input flex-1"
          />
          <button type="submit" className="btn-primary">
            Anlegen
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : vorlagen.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Statusvorlagen angelegt.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {vorlagen.map((v) => (
            <div key={v.id} className="flex items-center">
              <button
                onClick={() => setAusgewaehlteVorlage(v.id)}
                className={`rounded-l-full border px-3 py-1 text-xs font-medium ${
                  ausgewaehlteVorlage === v.id
                    ? 'border-brand bg-brand-soft text-brand-text'
                    : 'border-border-strong text-text-muted'
                }`}
              >
                {v.name}
              </button>
              <button
                onClick={() => handleDeleteVorlage(v.id)}
                className={`rounded-r-full border border-l-0 px-2 py-1 text-xs ${
                  ausgewaehlteVorlage === v.id ? 'border-brand text-brand/60' : 'border-border-strong text-text-subtle'
                }`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {ausgewaehlteVorlage && (
        <div className="card p-4">
          {werte.length === 0 ? (
            <p className="mb-3 text-sm text-text-muted">Noch keine Statuswerte in dieser Vorlage.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {werte.map((w, i) => (
                <li key={w.id} className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveWert(i, -1)}
                      disabled={i === 0}
                      className="leading-none text-text-subtle disabled:opacity-20"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveWert(i, 1)}
                      disabled={i === werte.length - 1}
                      className="leading-none text-text-subtle disabled:opacity-20"
                    >
                      ▼
                    </button>
                  </div>
                  <span style={{ backgroundColor: w.farbe }} className="h-4 w-4 flex-shrink-0 rounded-full" />
                  <span className="flex-1 truncate text-sm text-text">{w.titel}</span>
                  <button
                    onClick={() => setStandard(w.id)}
                    className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                      w.ist_standard ? 'border-brand bg-brand-soft text-brand-text' : 'border-border-strong text-text-muted'
                    }`}
                  >
                    {w.ist_standard ? 'Standard' : 'Als Standard'}
                  </button>
                  <button
                    onClick={() => deleteWert(w.id)}
                    className="flex-shrink-0 text-xs text-text-subtle hover:text-red-600 dark:hover:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddWert} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <input
              value={neuerWertTitel}
              onChange={(e) => setNeuerWertTitel(e.target.value)}
              placeholder="z. B. Grobinstallation fertig"
              className="field-input min-w-[10rem] flex-1"
            />
            <div className="flex items-center gap-1.5">
              {farbPalette.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setNeuerWertFarbe(c)}
                  style={{ backgroundColor: c }}
                  className={`h-5 w-5 rounded-full ${neuerWertFarbe === c ? 'ring-2 ring-offset-1 ring-offset-surface ring-text' : ''}`}
                />
              ))}
            </div>
            <button type="submit" className="btn-primary">
              Hinzufügen
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
