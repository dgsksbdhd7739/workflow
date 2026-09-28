import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { supabase, uploadFile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { TagesberichtVorlage } from '../types/database'

export function TagesberichtVorlagen() {
  const { user, role, unternehmenId } = useAuth()
  const [vorlagen, setVorlagen] = useState<TagesberichtVorlage[]>([])
  const [loading, setLoading] = useState(true)

  const [neueVorlageName, setNeueVorlageName] = useState('')
  const [vorlageFormOffen, setVorlageFormOffen] = useState(false)
  const [neueDatei, setNeueDatei] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [hochladenFuer, setHochladenFuer] = useState<string | null>(null)
  const [ersatzDatei, setErsatzDatei] = useState<File | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const loadVorlagen = async () => {
    setLoading(true)
    const { data } = await supabase.from('tagesbericht_vorlagen').select('*').order('erstellt_am')
    setVorlagen(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadVorlagen()
  }, [])

  const handleCreateVorlage = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !unternehmenId || !neueVorlageName.trim()) return
    setFehler(null)
    setSaving(true)
    let pdf_datei_pfad: string | null = null
    if (neueDatei) {
      const { path, error } = await uploadFile('tagesbericht-vorlagen', unternehmenId, neueDatei)
      if (error) {
        setFehler(error)
        setSaving(false)
        return
      }
      pdf_datei_pfad = path
    }
    const { error } = await supabase.from('tagesbericht_vorlagen').insert({
      name: neueVorlageName.trim(),
      erstellt_von: user.id,
      unternehmen_id: unternehmenId,
      pdf_datei_pfad,
    })
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setNeueVorlageName('')
    setNeueDatei(null)
    setVorlageFormOffen(false)
    loadVorlagen()
  }

  const handleDeleteVorlage = async (id: string) => {
    if (!window.confirm('Diese Vorlage wirklich löschen? Bereits erstellte Tagesberichte bleiben erhalten.')) return
    setFehler(null)
    setVorlagen((prev) => prev.filter((v) => v.id !== id))
    const { error } = await supabase.from('tagesbericht_vorlagen').delete().eq('id', id)
    if (error) {
      setFehler(error.message)
      loadVorlagen()
    }
  }

  const setStandard = async (id: string) => {
    setFehler(null)
    setVorlagen((prev) => prev.map((v) => ({ ...v, ist_standard: v.id === id })))
    const r1 = await supabase.from('tagesbericht_vorlagen').update({ ist_standard: false }).eq('unternehmen_id', unternehmenId)
    const r2 = await supabase.from('tagesbericht_vorlagen').update({ ist_standard: true }).eq('id', id)
    if (r1.error || r2.error) {
      setFehler((r1.error ?? r2.error)!.message)
      loadVorlagen()
    }
  }

  const handleDateiErsetzen = async (vorlage: TagesberichtVorlage, e: ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0]
    e.target.value = ''
    if (!datei || !unternehmenId) return
    setErsatzDatei(datei)
    setFehler(null)
    const { path, error } = await uploadFile('tagesbericht-vorlagen', unternehmenId, datei)
    setErsatzDatei(null)
    if (error) {
      setFehler(error)
      return
    }
    const { error: updateError } = await supabase
      .from('tagesbericht_vorlagen')
      .update({ pdf_datei_pfad: path })
      .eq('id', vorlage.id)
    if (updateError) {
      setFehler(updateError.message)
      return
    }
    setHochladenFuer(null)
    loadVorlagen()
  }

  if (role && role !== 'admin' && role !== 'planer') {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — Tagesbericht-Vorlagen sind Admin und Planer vorbehalten.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Tagesbericht-Vorlagen</h1>
          <p className="text-xs text-text-muted">
            Optional eine eigene PDF-Vorlage mit ausfüllbaren Formularfeldern hochladen (Feldnamen z. B. "datum",
            "taetigkeiten", "personal_anzahl", "besonderheiten", "ersteller", "tueren"). Ohne eigene Vorlage wird das
            Standard-Layout verwendet.
          </p>
        </div>
        <button onClick={() => setVorlageFormOffen((v) => !v)} className="btn-primary">
          {vorlageFormOffen ? 'Abbrechen' : '+ Vorlage'}
        </button>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {vorlageFormOffen && (
        <form onSubmit={handleCreateVorlage} className="card mb-4 space-y-2 p-4">
          <input
            autoFocus
            value={neueVorlageName}
            onChange={(e) => setNeueVorlageName(e.target.value)}
            placeholder="z. B. Standard-Bautagebuch"
            className="field-input"
          />
          <div>
            <label className="field-label">Eigene PDF-Vorlage (optional, mit Formularfeldern)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setNeueDatei(e.target.files?.[0] ?? null)}
              className="field-input"
            />
          </div>
          <button type="submit" disabled={saving || !neueVorlageName.trim()} className="btn-primary">
            {saving ? 'Speichert…' : 'Anlegen'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : vorlagen.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Tagesbericht-Vorlagen angelegt — es gilt das Standard-Layout.</p>
      ) : (
        <ul className="space-y-2">
          {vorlagen.map((v) => (
            <li key={v.id} className="card flex flex-wrap items-center gap-2 p-3">
              <span className="min-w-0 flex-1 truncate text-sm text-text">{v.name}</span>
              <span className="flex-shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-xs text-text-muted">
                {v.pdf_datei_pfad ? 'Eigene PDF-Vorlage' : 'Standard-Layout'}
              </span>
              <button
                onClick={() => setStandard(v.id)}
                className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                  v.ist_standard ? 'border-brand bg-brand-soft text-brand-text' : 'border-border-strong text-text-muted'
                }`}
              >
                {v.ist_standard ? 'Standard' : 'Als Standard'}
              </button>
              <label className="flex-shrink-0 cursor-pointer text-xs text-brand hover:underline">
                {ersatzDatei && hochladenFuer === v.id ? 'Lädt hoch…' : v.pdf_datei_pfad ? 'PDF ersetzen' : 'PDF hochladen'}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onClick={() => setHochladenFuer(v.id)}
                  onChange={(e) => handleDateiErsetzen(v, e)}
                />
              </label>
              <button
                onClick={() => handleDeleteVorlage(v.id)}
                className="flex-shrink-0 text-xs text-text-subtle hover:text-red-600 dark:hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
