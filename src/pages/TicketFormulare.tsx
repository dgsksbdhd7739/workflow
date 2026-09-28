import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { TicketFormular, TicketFormularFeld, TicketFormularFeldtyp } from '../types/database'

const feldtypLabel: Record<TicketFormularFeldtyp, string> = {
  text: 'Text',
  zahl: 'Zahl',
  datum: 'Datum',
  checkbox: 'Ja/Nein',
  auswahl: 'Auswahl',
}

export function TicketFormulare() {
  const { user, role, unternehmenId } = useAuth()
  const [formulare, setFormulare] = useState<TicketFormular[]>([])
  const [felder, setFelder] = useState<TicketFormularFeld[]>([])
  const [ausgewaehltesFormular, setAusgewaehltesFormular] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [neuerFormularName, setNeuerFormularName] = useState('')
  const [formularFormOffen, setFormularFormOffen] = useState(false)

  const [neuesFeldTitel, setNeuesFeldTitel] = useState('')
  const [neuesFeldTyp, setNeuesFeldTyp] = useState<TicketFormularFeldtyp>('text')
  const [neuesFeldPflicht, setNeuesFeldPflicht] = useState(false)
  const [neuesFeldOptionen, setNeuesFeldOptionen] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)

  const loadFormulare = async () => {
    setLoading(true)
    const { data } = await supabase.from('ticket_formulare').select('*').order('erstellt_am')
    setFormulare(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadFormulare()
  }, [])

  const loadFelder = async (formularId: string) => {
    const { data } = await supabase
      .from('ticket_formular_felder')
      .select('*')
      .eq('formular_id', formularId)
      .order('reihenfolge')
    setFelder(data ?? [])
  }

  useEffect(() => {
    if (ausgewaehltesFormular) loadFelder(ausgewaehltesFormular)
    else setFelder([])
  }, [ausgewaehltesFormular])

  const handleCreateFormular = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !unternehmenId || !neuerFormularName.trim()) return
    setFehler(null)
    const { data, error } = await supabase
      .from('ticket_formulare')
      .insert({ name: neuerFormularName.trim(), erstellt_von: user.id, unternehmen_id: unternehmenId })
      .select()
      .single()
    if (error) {
      setFehler(error.message)
      return
    }
    setNeuerFormularName('')
    setFormularFormOffen(false)
    await loadFormulare()
    if (data) setAusgewaehltesFormular(data.id)
  }

  const handleDeleteFormular = async (id: string) => {
    if (!window.confirm('Dieses Formular inklusive aller Felder wirklich löschen? Bereits erfasste Ticket-Werte bleiben erhalten.')) return
    setFehler(null)
    if (ausgewaehltesFormular === id) setAusgewaehltesFormular(null)
    setFormulare((prev) => prev.filter((v) => v.id !== id))
    const { error } = await supabase.from('ticket_formulare').delete().eq('id', id)
    if (error) {
      setFehler(error.message)
      loadFormulare()
    }
  }

  const setStandardFormular = async (id: string) => {
    setFehler(null)
    setFormulare((prev) => prev.map((v) => ({ ...v, ist_standard: v.id === id })))
    const r1 = await supabase.from('ticket_formulare').update({ ist_standard: false }).eq('unternehmen_id', unternehmenId)
    const r2 = await supabase.from('ticket_formulare').update({ ist_standard: true }).eq('id', id)
    if (r1.error || r2.error) {
      setFehler((r1.error ?? r2.error)!.message)
      loadFormulare()
    }
  }

  const handleAddFeld = async (e: FormEvent) => {
    e.preventDefault()
    if (!ausgewaehltesFormular || !neuesFeldTitel.trim()) return
    setFehler(null)
    const reihenfolge = felder.length > 0 ? Math.max(...felder.map((f) => f.reihenfolge)) + 1 : 1
    const optionen =
      neuesFeldTyp === 'auswahl'
        ? neuesFeldOptionen
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : null
    const { error } = await supabase.from('ticket_formular_felder').insert({
      formular_id: ausgewaehltesFormular,
      titel: neuesFeldTitel.trim(),
      feldtyp: neuesFeldTyp,
      pflichtfeld: neuesFeldPflicht,
      optionen,
      reihenfolge,
    })
    if (error) {
      setFehler(error.message)
      return
    }
    setNeuesFeldTitel('')
    setNeuesFeldTyp('text')
    setNeuesFeldPflicht(false)
    setNeuesFeldOptionen('')
    loadFelder(ausgewaehltesFormular)
  }

  const moveFeld = async (index: number, richtung: -1 | 1) => {
    if (!ausgewaehltesFormular) return
    const zielIndex = index + richtung
    if (zielIndex < 0 || zielIndex >= felder.length) return
    setFehler(null)
    const a = felder[index]
    const b = felder[zielIndex]
    setFelder((prev) => {
      const next = [...prev]
      ;[next[index], next[zielIndex]] = [next[zielIndex], next[index]]
      return next
    })
    const [r1, r2] = await Promise.all([
      supabase.from('ticket_formular_felder').update({ reihenfolge: b.reihenfolge }).eq('id', a.id),
      supabase.from('ticket_formular_felder').update({ reihenfolge: a.reihenfolge }).eq('id', b.id),
    ])
    if (r1.error || r2.error) {
      setFehler((r1.error ?? r2.error)!.message)
      loadFelder(ausgewaehltesFormular)
    }
  }

  const deleteFeld = async (feldId: string) => {
    if (!ausgewaehltesFormular) return
    if (!window.confirm('Dieses Feld wirklich löschen?')) return
    setFehler(null)
    setFelder((prev) => prev.filter((f) => f.id !== feldId))
    const { error } = await supabase.from('ticket_formular_felder').delete().eq('id', feldId)
    if (error) {
      setFehler(error.message)
      loadFelder(ausgewaehltesFormular)
    }
  }

  if (role && role !== 'admin' && role !== 'planer') {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — Ticket-Formulare sind Admin und Planer vorbehalten.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Ticket-Formulare</h1>
          <p className="text-xs text-text-muted">
            Eigene Zusatzfelder für Tickets definieren, z. B. je Mangelart. Beim Anlegen eines Tickets wählbar.
          </p>
        </div>
        <button onClick={() => setFormularFormOffen((v) => !v)} className="btn-primary">
          {formularFormOffen ? 'Abbrechen' : '+ Formular'}
        </button>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {formularFormOffen && (
        <form onSubmit={handleCreateFormular} className="mb-4 flex gap-2">
          <input
            autoFocus
            value={neuerFormularName}
            onChange={(e) => setNeuerFormularName(e.target.value)}
            placeholder="z. B. Mängel Elektro"
            className="field-input flex-1"
          />
          <button type="submit" className="btn-primary">
            Anlegen
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : formulare.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Ticket-Formulare angelegt.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {formulare.map((v) => (
            <div key={v.id} className="flex items-center">
              <button
                onClick={() => setAusgewaehltesFormular(v.id)}
                className={`rounded-l-full border px-3 py-1 text-xs font-medium ${
                  ausgewaehltesFormular === v.id
                    ? 'border-brand bg-brand-soft text-brand-text'
                    : 'border-border-strong text-text-muted'
                }`}
              >
                {v.name}
                {v.ist_standard && ' ★'}
              </button>
              <button
                onClick={() => handleDeleteFormular(v.id)}
                className={`rounded-r-full border border-l-0 px-2 py-1 text-xs ${
                  ausgewaehltesFormular === v.id ? 'border-brand text-brand/60' : 'border-border-strong text-text-subtle'
                }`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {ausgewaehltesFormular && (
        <div className="card p-4">
          <button
            onClick={() => setStandardFormular(ausgewaehltesFormular)}
            className={`mb-3 rounded-full border px-2 py-0.5 text-xs ${
              formulare.find((f) => f.id === ausgewaehltesFormular)?.ist_standard
                ? 'border-brand bg-brand-soft text-brand-text'
                : 'border-border-strong text-text-muted'
            }`}
          >
            {formulare.find((f) => f.id === ausgewaehltesFormular)?.ist_standard ? 'Standard-Formular' : 'Als Standard setzen'}
          </button>

          {felder.length === 0 ? (
            <p className="mb-3 text-sm text-text-muted">Noch keine Felder in diesem Formular.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {felder.map((f, i) => (
                <li key={f.id} className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button
                      onClick={() => moveFeld(i, -1)}
                      disabled={i === 0}
                      className="leading-none text-text-subtle disabled:opacity-20"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveFeld(i, 1)}
                      disabled={i === felder.length - 1}
                      className="leading-none text-text-subtle disabled:opacity-20"
                    >
                      ▼
                    </button>
                  </div>
                  <span className="flex-1 truncate text-sm text-text">
                    {f.titel}
                    {f.pflichtfeld && <span className="text-red-600 dark:text-red-400"> *</span>}
                  </span>
                  <span className="flex-shrink-0 rounded-full border border-border-strong px-2 py-0.5 text-xs text-text-muted">
                    {feldtypLabel[f.feldtyp]}
                    {f.feldtyp === 'auswahl' && f.optionen ? `: ${f.optionen.join(', ')}` : ''}
                  </span>
                  <button
                    onClick={() => deleteFeld(f.id)}
                    className="flex-shrink-0 text-xs text-text-subtle hover:text-red-600 dark:hover:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddFeld} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <input
              value={neuesFeldTitel}
              onChange={(e) => setNeuesFeldTitel(e.target.value)}
              placeholder="z. B. Raumbezeichnung"
              className="field-input min-w-[10rem] flex-1"
            />
            <select
              value={neuesFeldTyp}
              onChange={(e) => setNeuesFeldTyp(e.target.value as TicketFormularFeldtyp)}
              className="field-input w-auto"
            >
              {(Object.keys(feldtypLabel) as TicketFormularFeldtyp[]).map((t) => (
                <option key={t} value={t}>
                  {feldtypLabel[t]}
                </option>
              ))}
            </select>
            {neuesFeldTyp === 'auswahl' && (
              <input
                value={neuesFeldOptionen}
                onChange={(e) => setNeuesFeldOptionen(e.target.value)}
                placeholder="Optionen, mit Komma getrennt"
                className="field-input min-w-[12rem] flex-1"
              />
            )}
            <label className="flex items-center gap-1.5 text-sm text-text-muted">
              <input type="checkbox" checked={neuesFeldPflicht} onChange={(e) => setNeuesFeldPflicht(e.target.checked)} />
              Pflichtfeld
            </label>
            <button type="submit" className="btn-primary">
              Hinzufügen
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
