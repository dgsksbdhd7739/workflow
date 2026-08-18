import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, CalendarClock, LayoutGrid, List, Map as MapIcon, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { MangelDetails } from '../components/MangelDetails'
import { Arbeitszeit } from '../components/Arbeitszeit'
import { SignedImage } from '../components/SignedImage'
import { exportMaengelPdf } from '../lib/pdf'
import { formatDatum } from '../lib/datum'
import { komprimiereBild } from '../lib/bildKompression'
import type { Baustelle, Mangel, MangelPrioritaet, MangelStatus, StatusVorlageWert } from '../types/database'

const heute = () => new Date().toISOString().slice(0, 10)

const statusLabel: Record<MangelStatus, string> = {
  offen: 'Stopp',
  in_bearbeitung: 'In Arbeit',
  erledigt: 'Abgeschlossen',
}

const statusColor: Record<MangelStatus, string> = {
  offen: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  in_bearbeitung: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  erledigt: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
}

const statusSpalten: MangelStatus[] = ['offen', 'in_bearbeitung', 'erledigt']

const prioritaetLabel: Record<MangelPrioritaet, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
}

function istUeberfaellig(m: Mangel) {
  return m.status !== 'erledigt' && !!m.faellig_am && m.faellig_am < heute()
}

interface MangelKarteProps {
  m: Mangel
  wert?: StatusVorlageWert
  baustelleId?: string
  kannBearbeiten: boolean
  kannLoeschen: boolean
  geoeffnet: boolean
  onToggleDetails: () => void
  onStatusChange: (status: MangelStatus) => void
  onDelete: () => void
  onDetailsChange: () => void
  nameOf: (id: string | null) => string
  draggable?: boolean
  onDragStart?: () => void
  ausgewaehlt: boolean
  onToggleAuswahl: () => void
}

function MangelKarte({
  m,
  wert,
  baustelleId,
  kannBearbeiten,
  kannLoeschen,
  geoeffnet,
  onToggleDetails,
  onStatusChange,
  onDelete,
  onDetailsChange,
  nameOf,
  draggable,
  onDragStart,
  ausgewaehlt,
  onToggleAuswahl,
}: MangelKarteProps) {
  const ueberfaellig = istUeberfaellig(m)
  return (
    <div className={`card p-4 ${ausgewaehlt ? 'ring-2 ring-brand' : ''}`} draggable={draggable} onDragStart={onDragStart}>
      <div className="flex items-start justify-between gap-3">
        {kannLoeschen && (
          <input
            type="checkbox"
            checked={ausgewaehlt}
            onChange={onToggleAuswahl}
            aria-label={`"${m.titel}" auswählen`}
            className="mt-1 h-4 w-4 flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-text">{m.titel}</div>
          {m.beschreibung && <div className="mt-1 text-sm text-text-muted">{m.beschreibung}</div>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-subtle">
            <span>Priorität: {prioritaetLabel[m.prioritaet]}</span>
            <span>Verantwortlich: {nameOf(m.verantwortlicher_id)}</span>
          </div>
        </div>
        {m.foto_pfad && (
          <SignedImage
            bucket="mangel-fotos"
            path={m.foto_pfad}
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
          />
        )}
      </div>
      <div className="mt-3">
        <Arbeitszeit mangel={m} onChange={onDetailsChange} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[m.status]}`}>{statusLabel[m.status]}</span>
          {wert && (
            <span
              style={{ backgroundColor: `${wert.farbe}22`, color: wert.farbe }}
              className="rounded-full px-2 py-0.5 text-xs font-medium"
            >
              {wert.titel}
            </span>
          )}
          {m.faellig_am && (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                ueberfaellig
                  ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
                  : 'bg-surface-hover text-text-muted'
              }`}
            >
              {ueberfaellig ? <AlertTriangle className="h-3 w-3" strokeWidth={2.5} /> : <CalendarClock className="h-3 w-3" strokeWidth={2.25} />}
              {ueberfaellig ? 'Überfällig' : 'Fällig'}: {formatDatum(m.faellig_am)}
            </span>
          )}
        </div>
        {kannBearbeiten && (
          <select
            value={m.status}
            onChange={(e) => onStatusChange(e.target.value as MangelStatus)}
            className="rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs text-text"
          >
            {(['offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </select>
        )}
      </div>
      {m.plan_id && (
        <Link to={`/baustellen/${baustelleId}/plaene/${m.plan_id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-brand">
          <MapIcon className="h-3 w-3" strokeWidth={2.25} />
          Position auf Plan ansehen
        </Link>
      )}
      <div className="mt-2 flex items-center justify-between">
        <button onClick={onToggleDetails} className="text-xs font-medium text-brand">
          {geoeffnet ? 'Details ausblenden' : 'Fortschritt & Kommentare'}
        </button>
        {kannLoeschen && (
          <button onClick={onDelete} className="text-xs font-medium text-red-600 dark:text-red-400">
            Löschen
          </button>
        )}
      </div>
      {geoeffnet && (
        <div className="mt-3 border-t border-border pt-3">
          <MangelDetails mangelId={m.id} onChange={onDetailsChange} />
        </div>
      )}
    </div>
  )
}

export function Maengel() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user, role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const kannLoeschen = role === 'admin' || role === 'planer'
  const { profiles, nameOf } = useProfiles()
  const [baustelle, setBaustelle] = useState<Baustelle | null>(null)
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<MangelStatus | 'alle' | 'ueberfaellig'>('alle')
  const [suche, setSuche] = useState('')
  const [ansicht, setAnsicht] = useState<'liste' | 'board'>('liste')
  const [ziehtId, setZiehtId] = useState<string | null>(null)
  const [dragZielSpalte, setDragZielSpalte] = useState<MangelStatus | null>(null)
  const [geoeffnetId, setGeoeffnetId] = useState<string | null>(null)
  const [werteMap, setWerteMap] = useState<Record<string, StatusVorlageWert>>({})
  const [fehler, setFehler] = useState<string | null>(null)
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<string>>(new Set())

  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [prioritaet, setPrioritaet] = useState<MangelPrioritaet>('mittel')
  const [verantwortlicherId, setVerantwortlicherId] = useState('')
  const [faelligAm, setFaelligAm] = useState('')
  const [foto, setFoto] = useState<File | null>(null)

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const [{ data }, { data: baustelleData }] = await Promise.all([
      supabase.from('maengel').select('*').eq('baustelle_id', baustelleId).order('erstellt_am', { ascending: false }),
      supabase.from('baustellen').select('*').eq('id', baustelleId).single(),
    ])
    setMaengel(data ?? [])
    setBaustelle(baustelleData)
    setLoading(false)
  }

  useEffect(() => {
    load()
    setAusgewaehlt(new Set())
    supabase
      .from('statusvorlage_werte')
      .select('*')
      .then(({ data }) => {
        const map: Record<string, StatusVorlageWert> = {}
        for (const w of data ?? []) map[w.id] = w
        setWerteMap(map)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelleId])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !baustelleId) return
    setSaving(true)
    setFehler(null)

    let foto_pfad: string | null = null
    if (foto) {
      const fotoKomprimiert = await komprimiereBild(foto)
      const path = `${baustelleId}/${Date.now()}-${fotoKomprimiert.name}`
      const { error: uploadError } = await supabase.storage.from('mangel-fotos').upload(path, fotoKomprimiert)
      if (uploadError) {
        setSaving(false)
        setFehler(`Foto-Upload fehlgeschlagen: ${uploadError.message}`)
        return
      }
      foto_pfad = path
    }

    const { error } = await supabase.from('maengel').insert({
      baustelle_id: baustelleId,
      titel,
      beschreibung: beschreibung || null,
      prioritaet,
      verantwortlicher_id: verantwortlicherId || null,
      faellig_am: faelligAm || null,
      foto_pfad,
      erstellt_von: user.id,
    })

    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
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
    setFehler(null)
    setMaengel((prev) => prev.map((m) => (m.id === mangelId ? { ...m, status } : m)))
    const { error } = await supabase.from('maengel').update({ status }).eq('id', mangelId)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const handleDelete = async (m: Mangel) => {
    if (!window.confirm(`"${m.titel}" wirklich endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return
    setFehler(null)
    const { error } = await supabase.from('maengel').delete().eq('id', m.id)
    if (error) {
      setFehler(error.message)
      return
    }
    load()
  }

  const toggleAuswahl = (id: string) => {
    setAusgewaehlt((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(ausgewaehlt)
    if (ids.length === 0) return
    if (!window.confirm(`${ids.length} Aufgabe${ids.length === 1 ? '' : 'n'} wirklich endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) {
      return
    }
    setFehler(null)
    const { error } = await supabase.from('maengel').delete().in('id', ids)
    if (error) {
      setFehler(error.message)
      return
    }
    setAusgewaehlt(new Set())
    load()
  }

  const nachStatus =
    filterStatus === 'alle'
      ? maengel
      : filterStatus === 'ueberfaellig'
        ? maengel.filter(istUeberfaellig)
        : maengel.filter((m) => m.status === filterStatus)

  const sucheNormalisiert = suche.trim().toLowerCase()
  const gefiltert = sucheNormalisiert
    ? nachStatus.filter(
        (m) =>
          m.titel.toLowerCase().includes(sucheNormalisiert) ||
          (m.beschreibung ?? '').toLowerCase().includes(sucheNormalisiert),
      )
    : nachStatus

  const ueberfaelligAnzahl = maengel.filter(istUeberfaellig).length

  return (
    <div className={ansicht === 'board' ? 'mx-auto max-w-6xl px-4 py-6' : 'page'}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Aufgaben</h1>
          {baustelle?.projekt_ende && (
            <p className="text-xs text-text-muted">Projekt fällig bis {formatDatum(baustelle.projekt_ende)}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-0.5 rounded-lg border border-border-strong bg-surface p-0.5 md:flex">
            <button
              onClick={() => setAnsicht('liste')}
              aria-label="Listenansicht"
              className={`rounded-md p-1.5 transition-colors ${
                ansicht === 'liste' ? 'bg-brand-soft text-brand-text' : 'text-text-muted hover:text-text'
              }`}
            >
              <List className="h-4 w-4" strokeWidth={2.25} />
            </button>
            <button
              onClick={() => setAnsicht('board')}
              aria-label="Board-Ansicht"
              className={`rounded-md p-1.5 transition-colors ${
                ansicht === 'board' ? 'bg-brand-soft text-brand-text' : 'text-text-muted hover:text-text'
              }`}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
          {baustelle && gefiltert.length > 0 && (
            <button onClick={() => exportMaengelPdf(baustelle, gefiltert, nameOf)} className="btn-secondary">
              PDF exportieren
            </button>
          )}
          {kannBearbeiten && (
            <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
              {showForm ? 'Abbrechen' : '+ Aufgabe anlegen'}
            </button>
          )}
        </div>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {kannLoeschen && ausgewaehlt.size > 0 && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
          <span className="text-sm font-medium text-text">{ausgewaehlt.size} ausgewählt</span>
          <button
            onClick={() => setAusgewaehlt(new Set(gefiltert.map((m) => m.id)))}
            className="text-xs font-medium text-brand"
          >
            Alle in dieser Ansicht auswählen
          </button>
          <button onClick={() => setAusgewaehlt(new Set())} className="text-xs font-medium text-text-muted">
            Auswahl aufheben
          </button>
          <button onClick={handleBulkDelete} className="btn-secondary ml-auto text-xs text-red-600 dark:text-red-400">
            {ausgewaehlt.size} Aufgabe{ausgewaehlt.size === 1 ? '' : 'n'} löschen
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['alle', 'offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === s ? 'bg-brand text-white' : 'bg-surface-hover text-text-muted'
            }`}
          >
            {s === 'alle' ? 'Alle' : statusLabel[s]}
          </button>
        ))}
        {ueberfaelligAnzahl > 0 && (
          <button
            onClick={() => setFilterStatus('ueberfaellig')}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === 'ueberfaellig' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
            }`}
          >
            <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
            Überfällig ({ueberfaelligAnzahl})
          </button>
        )}
        <div className="relative ml-auto min-w-[10rem] flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-subtle" strokeWidth={2.25} />
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Aufgaben durchsuchen…"
            className="field-input py-1.5 pl-8 text-xs"
          />
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3 p-4">
          <div>
            <label className="field-label">Titel</label>
            <input
              required
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              className="field-input"
              placeholder="z. B. Tür einbauen"
            />
          </div>
          <div>
            <label className="field-label">Beschreibung</label>
            <textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              rows={3}
              className="field-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Priorität</label>
              <select
                value={prioritaet}
                onChange={(e) => setPrioritaet(e.target.value as MangelPrioritaet)}
                className="field-input"
              >
                {(['niedrig', 'mittel', 'hoch'] as const).map((p) => (
                  <option key={p} value={p}>
                    {prioritaetLabel[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Fällig am (optional)</label>
              <input
                type="date"
                value={faelligAm}
                onChange={(e) => setFaelligAm(e.target.value)}
                className="field-input"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Verantwortlich</label>
            <select
              value={verantwortlicherId}
              onChange={(e) => setVerantwortlicherId(e.target.value)}
              className="field-input"
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
            <label className="field-label">Foto</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-text-muted"
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Speichert…' : 'Aufgabe speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : gefiltert.length === 0 ? (
        <p className="text-sm text-text-muted">Keine Aufgaben in dieser Ansicht.</p>
      ) : ansicht === 'liste' ? (
        <ul className="space-y-3">
          {gefiltert.map((m) => (
            <li key={m.id}>
              <MangelKarte
                m={m}
                wert={m.status_wert_id ? werteMap[m.status_wert_id] : undefined}
                baustelleId={baustelleId}
                kannBearbeiten={kannBearbeiten}
                kannLoeschen={kannLoeschen}
                geoeffnet={geoeffnetId === m.id}
                onToggleDetails={() => setGeoeffnetId((prev) => (prev === m.id ? null : m.id))}
                onStatusChange={(status) => updateStatus(m.id, status)}
                onDelete={() => handleDelete(m)}
                onDetailsChange={load}
                nameOf={nameOf}
                ausgewaehlt={ausgewaehlt.has(m.id)}
                onToggleAuswahl={() => toggleAuswahl(m.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {statusSpalten.map((spalte) => {
            const karten = gefiltert.filter((m) => m.status === spalte)
            return (
              <div
                key={spalte}
                onDragOver={(e) => {
                  if (!kannBearbeiten || !ziehtId) return
                  e.preventDefault()
                  setDragZielSpalte(spalte)
                }}
                onDragLeave={() => setDragZielSpalte((prev) => (prev === spalte ? null : prev))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragZielSpalte(null)
                  if (ziehtId) updateStatus(ziehtId, spalte)
                  setZiehtId(null)
                }}
                className={`flex flex-col gap-3 rounded-xl border-2 border-dashed p-2 transition-colors ${
                  dragZielSpalte === spalte ? 'border-brand bg-brand-soft/30' : 'border-transparent'
                }`}
              >
                <div className="flex items-center justify-between px-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[spalte]}`}>{statusLabel[spalte]}</span>
                  <span className="text-xs text-text-subtle">{karten.length}</span>
                </div>
                {karten.map((m) => (
                  <div key={m.id} className={kannBearbeiten ? 'cursor-grab active:cursor-grabbing' : ''}>
                    <MangelKarte
                      m={m}
                      wert={m.status_wert_id ? werteMap[m.status_wert_id] : undefined}
                      baustelleId={baustelleId}
                      kannBearbeiten={kannBearbeiten}
                      kannLoeschen={kannLoeschen}
                      geoeffnet={geoeffnetId === m.id}
                      onToggleDetails={() => setGeoeffnetId((prev) => (prev === m.id ? null : m.id))}
                      onStatusChange={(status) => updateStatus(m.id, status)}
                      onDelete={() => handleDelete(m)}
                      onDetailsChange={load}
                      nameOf={nameOf}
                      draggable={kannBearbeiten}
                      onDragStart={() => setZiehtId(m.id)}
                      ausgewaehlt={ausgewaehlt.has(m.id)}
                      onToggleAuswahl={() => toggleAuswahl(m.id)}
                    />
                  </div>
                ))}
                {karten.length === 0 && <p className="px-1 text-xs text-text-subtle">Keine Aufgaben</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
