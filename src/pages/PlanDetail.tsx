import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, getSignedUrl } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { MangelDetails } from '../components/MangelDetails'
import type { Mangel, MangelPrioritaet, MangelStatus, Plan, StatusVorlage, StatusVorlageWert } from '../types/database'

const statusLabel: Record<MangelStatus, string> = {
  offen: 'Offen',
  in_bearbeitung: 'In Bearbeitung',
  erledigt: 'Erledigt',
}

const prioritaetLabel: Record<MangelPrioritaet, string> = {
  niedrig: 'Niedrig',
  mittel: 'Mittel',
  hoch: 'Hoch',
}

const statusFarbe: Record<MangelStatus, string> = {
  offen: '#dc2626',
  in_bearbeitung: '#d97706',
  erledigt: '#16a34a',
}

const farbPalette = ['#dc2626', '#ea580c', '#d97706', '#16a34a', '#2563eb', '#9333ea']

function pinFarbe(m: Mangel, werte: StatusVorlageWert[]) {
  if (m.farbe) return m.farbe
  const wert = werte.find((w) => w.id === m.status_wert_id)
  if (wert) return wert.farbe
  return statusFarbe[m.status]
}

function istLetzterWert(m: Mangel, werte: StatusVorlageWert[]) {
  if (werte.length === 0) return m.status === 'erledigt'
  const maxReihenfolge = Math.max(...werte.map((w) => w.reihenfolge))
  const wert = werte.find((w) => w.id === m.status_wert_id)
  return wert?.reihenfolge === maxReihenfolge
}

function klassischerStatusAusWert(wertId: string, werte: StatusVorlageWert[]): MangelStatus {
  const sortiert = [...werte].sort((a, b) => a.reihenfolge - b.reihenfolge)
  const index = sortiert.findIndex((w) => w.id === wertId)
  if (index === sortiert.length - 1) return 'erledigt'
  if (index <= 0) return 'offen'
  return 'in_bearbeitung'
}

function FarbAuswahl({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full border px-2 py-1 text-xs ${
          value === null ? 'border-brand bg-brand-soft text-brand-text' : 'border-border-strong text-text-muted'
        }`}
      >
        Automatisch (Status)
      </button>
      {farbPalette.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          style={{ backgroundColor: c }}
          className={`h-6 w-6 rounded-full ${value === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-text' : ''}`}
        />
      ))}
    </div>
  )
}

export function PlanDetail() {
  const { id: baustelleId, planId } = useParams<{ id: string; planId: string }>()
  const { user, role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const kannVorlageZuweisen = role === 'admin' || role === 'planer'
  const { profiles, nameOf } = useProfiles()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pins, setPins] = useState<Mangel[]>([])
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)
  const [selectedPin, setSelectedPin] = useState<Mangel | null>(null)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfReady, setPdfReady] = useState(false)
  const [pdfError, setPdfError] = useState(false)
  const [datenUrl, setDatenUrl] = useState<string | null>(null)

  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [prioritaet, setPrioritaet] = useState<MangelPrioritaet>('mittel')
  const [verantwortlicherId, setVerantwortlicherId] = useState('')
  const [faelligAm, setFaelligAm] = useState('')
  const [farbe, setFarbe] = useState<string | null>(null)

  const [editStatus, setEditStatus] = useState<MangelStatus>('offen')
  const [editPrioritaet, setEditPrioritaet] = useState<MangelPrioritaet>('mittel')
  const [editVerantwortlicherId, setEditVerantwortlicherId] = useState('')
  const [editFaelligAm, setEditFaelligAm] = useState('')
  const [editFarbe, setEditFarbe] = useState<string | null>(null)
  const [editStatusWertId, setEditStatusWertId] = useState('')

  const [statusWertId, setStatusWertId] = useState('')
  const [alleVorlagen, setAlleVorlagen] = useState<StatusVorlage[]>([])
  const [werte, setWerte] = useState<StatusVorlageWert[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  const load = async () => {
    if (!planId) return
    const [{ data: planData }, { data: pinsData }] = await Promise.all([
      supabase.from('plaene').select('*').eq('id', planId).single(),
      supabase.from('maengel').select('*').eq('plan_id', planId).order('erstellt_am'),
    ])
    setPlan(planData)
    setPins(pinsData ?? [])
    if (planData?.statusvorlage_id) {
      const { data: werteData } = await supabase
        .from('statusvorlage_werte')
        .select('*')
        .eq('statusvorlage_id', planData.statusvorlage_id)
        .order('reihenfolge')
      setWerte(werteData ?? [])
    } else {
      setWerte([])
    }
  }

  useEffect(() => {
    load()
    setZoom(1)
    supabase
      .from('statusvorlagen')
      .select('*')
      .order('name')
      .then(({ data }) => setAlleVorlagen(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  const handleVorlageZuweisen = async (vorlageId: string) => {
    if (!planId) return
    setFehler(null)
    const { error } = await supabase
      .from('plaene')
      .update({ statusvorlage_id: vorlageId || null })
      .eq('id', planId)
    if (error) setFehler(error.message)
    load()
  }

  const isPdf = Boolean(plan?.datei_pfad.match(/\.pdf$/i))

  useEffect(() => {
    if (!plan) {
      setDatenUrl(null)
      return
    }
    let cancelled = false
    setDatenUrl(null)
    getSignedUrl('plaene', plan.datei_pfad).then(({ url, error }) => {
      if (cancelled) return
      setDatenUrl(url)
      if (error) setFehler(`Plan konnte nicht geladen werden: ${error}`)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.datei_pfad])

  useEffect(() => {
    if (!datenUrl || !isPdf) return
    let cancelled = false
    setPdfReady(false)
    setPdfError(false)

    Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      .then(([pdfjsLib, { default: workerUrl }]) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
        return pdfjsLib.getDocument({ url: datenUrl }).promise
      })
      .then((pdf) => pdf.getPage(1))
      .then(async (page) => {
        const canvas = canvasRef.current
        if (!canvas || cancelled) return
        const viewport = page.getViewport({ scale: 2 })
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
        if (!cancelled) setPdfReady(true)
      })
      .catch(() => {
        if (!cancelled) setPdfError(true)
      })

    return () => {
      cancelled = true
    }
  }, [datenUrl, isPdf])

  useEffect(() => {
    if (!selectedPin) return
    setEditStatus(selectedPin.status)
    setEditPrioritaet(selectedPin.prioritaet)
    setEditVerantwortlicherId(selectedPin.verantwortlicher_id ?? '')
    setEditFaelligAm(selectedPin.faellig_am ?? '')
    setEditFarbe(selectedPin.farbe)
    setEditStatusWertId(selectedPin.status_wert_id ?? standardWertId())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPin])

  const standardWertId = () => werte.find((w) => w.ist_standard)?.id ?? werte[0]?.id ?? ''

  const resetNeuForm = () => {
    setTitel('')
    setBeschreibung('')
    setPrioritaet('mittel')
    setVerantwortlicherId('')
    setFaelligAm('')
    setFarbe(null)
    setStatusWertId(standardWertId())
  }

  const handlePlanClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setSelectedPin(null)
    resetNeuForm()
    setPendingPos({ x, y })
  }

  const handlePinClick = (e: MouseEvent, pin: Mangel) => {
    e.stopPropagation()
    setPendingPos(null)
    setSelectedPin(pin)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!pendingPos || !user || !baustelleId || !planId) return
    setSaving(true)
    setFehler(null)
    const { error } = await supabase.from('maengel').insert({
      baustelle_id: baustelleId,
      titel,
      beschreibung: beschreibung || null,
      prioritaet,
      verantwortlicher_id: verantwortlicherId || null,
      faellig_am: faelligAm || null,
      plan_id: planId,
      position_x: pendingPos.x,
      position_y: pendingPos.y,
      farbe,
      status_wert_id: werte.length > 0 ? statusWertId || null : null,
      status: werte.length > 0 && statusWertId ? klassischerStatusAusWert(statusWertId, werte) : 'offen',
      erstellt_von: user.id,
    })
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setPendingPos(null)
    resetNeuForm()
    load()
  }

  const handleUpdate = async () => {
    if (!selectedPin) return
    setSaving(true)
    setFehler(null)
    const status = werte.length > 0 && editStatusWertId ? klassischerStatusAusWert(editStatusWertId, werte) : editStatus
    const { error } = await supabase
      .from('maengel')
      .update({
        status,
        status_wert_id: werte.length > 0 ? editStatusWertId || null : null,
        prioritaet: editPrioritaet,
        verantwortlicher_id: editVerantwortlicherId || null,
        faellig_am: editFaelligAm || null,
        farbe: editFarbe,
      })
      .eq('id', selectedPin.id)
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setSelectedPin(null)
    load()
  }

  const handleUnpin = async () => {
    if (!selectedPin) return
    if (!window.confirm('Markierung wirklich vom Plan entfernen? Der Mangel bleibt in der Mängel-Liste erhalten.')) return
    setSaving(true)
    setFehler(null)
    const { error } = await supabase
      .from('maengel')
      .update({ plan_id: null, position_x: null, position_y: null })
      .eq('id', selectedPin.id)
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setSelectedPin(null)
    load()
  }

  if (!plan) return <p className="p-6 text-sm text-text-muted">Lädt…</p>
  if (!datenUrl) return <p className="p-6 text-sm text-text-muted">Lädt…</p>

  const isImage = plan.datei_pfad.match(/\.(png|jpe?g|webp|gif)$/i)
  const canMark = kannBearbeiten && (Boolean(isImage) || (isPdf && pdfReady))

  return (
    <div className="page">
      <Link to={`/baustellen/${baustelleId}/plaene`} className="mb-3 inline-block text-sm text-brand">
        ← Zurück zu Plänen
      </Link>
      <h1 className="mb-1 text-xl font-semibold text-text">{plan.name}</h1>

      {fehler && <p className="banner-error mb-3">Fehler: {fehler}</p>}

      <div className="mb-4 flex items-center gap-2 text-xs text-text-muted">
        <span>Statusvorlage:</span>
        {kannVorlageZuweisen ? (
          <select
            value={plan.statusvorlage_id ?? ''}
            onChange={(e) => handleVorlageZuweisen(e.target.value)}
            className="rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs text-text"
          >
            <option value="">— Keine (Standardstatus) —</option>
            {alleVorlagen.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        ) : (
          <span>{alleVorlagen.find((v) => v.id === plan.statusvorlage_id)?.name ?? 'Keine (Standardstatus)'}</span>
        )}
      </div>

      {isPdf && pdfError ? (
        <p className="text-sm text-text-muted">
          PDF konnte nicht geladen werden. <a className="text-brand" href={datenUrl} target="_blank" rel="noreferrer">Datei öffnen</a>
        </p>
      ) : !isImage && !isPdf ? (
        <p className="text-sm text-text-muted">
          Für dieses Dateiformat ist keine Markierung im Browser möglich. <a className="text-brand" href={datenUrl} target="_blank" rel="noreferrer">Datei öffnen</a>
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-text-muted">
              {canMark
                ? 'Auf den Plan tippen, um eine Aufgabe zu markieren. Vorhandene Markierung antippen zum Bearbeiten.'
                : 'PDF wird geladen…'}
            </p>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
                disabled={zoom <= 1}
                className="h-7 w-7 rounded-lg border border-border-strong text-sm font-medium text-text disabled:opacity-30"
              >
                −
              </button>
              <span className="w-11 text-center text-xs text-text-muted">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(4, z + 0.5))}
                disabled={zoom >= 4}
                className="h-7 w-7 rounded-lg border border-border-strong text-sm font-medium text-text disabled:opacity-30"
              >
                +
              </button>
              {zoom !== 1 && (
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="ml-1 text-xs font-medium text-brand"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
          </div>
          <div className="w-full overflow-x-auto rounded-xl border border-border">
            <div
              onClick={canMark ? handlePlanClick : undefined}
              className="relative cursor-crosshair select-none"
              style={{ width: `${zoom * 100}%` }}
            >
              {isPdf ? (
                <canvas ref={canvasRef} className="w-full select-none" />
              ) : (
                <img src={datenUrl} alt={plan.name} className="w-full select-none" draggable={false} />
              )}
              {isPdf && !pdfReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface-hover text-sm text-text-muted">
                  Lädt…
                </div>
              )}
              {pins.map((m) => (
                <div
                  key={m.id}
                  title={m.titel}
                  onClick={(e) => handlePinClick(e, m)}
                  style={{ left: `${m.position_x}%`, top: `${m.position_y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-full cursor-pointer"
                >
                  <div
                    style={{ backgroundColor: pinFarbe(m, werte) }}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow ring-2 ring-white"
                  >
                    {istLetzterWert(m, werte) ? '✓' : '!'}
                  </div>
                </div>
              ))}
              {pendingPos && (
                <div
                  style={{ left: `${pendingPos.x}%`, top: `${pendingPos.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-full"
                >
                  <div
                    style={{ backgroundColor: farbe ?? '#2563eb' }}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow animate-pulse ring-2 ring-white"
                  >
                    +
                  </div>
                </div>
              )}
            </div>
          </div>

          {pendingPos && (
            <form onSubmit={handleCreate} className="card mt-3 space-y-3 p-4">
              <div className="text-sm font-medium text-text">Neue Aufgabe an dieser Position</div>
              <div>
                <label className="field-label">Titel</label>
                <input
                  required
                  autoFocus
                  value={titel}
                  onChange={(e) => setTitel(e.target.value)}
                  placeholder="z. B. Tür einbauen"
                  className="field-input"
                />
              </div>
              <div>
                <label className="field-label">Beschreibung</label>
                <textarea
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  rows={2}
                  className="field-input"
                />
              </div>
              {werte.length > 0 && (
                <div>
                  <label className="field-label">Status</label>
                  <select
                    value={statusWertId}
                    onChange={(e) => setStatusWertId(e.target.value)}
                    className="field-input"
                  >
                    {werte.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.titel}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                  <label className="field-label">Fällig am</label>
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
                <label className="field-label">Farbe</label>
                <FarbAuswahl value={farbe} onChange={setFarbe} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Speichert…' : 'Aufgabe anlegen'}
                </button>
                <button type="button" onClick={() => setPendingPos(null)} className="btn-secondary">
                  Abbrechen
                </button>
              </div>
            </form>
          )}

          {selectedPin && (
            <div className="card mt-3 space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-text">{selectedPin.titel}</div>
                <button onClick={() => setSelectedPin(null)} className="text-xs text-text-muted">
                  Schließen
                </button>
              </div>
              {selectedPin.beschreibung && <p className="text-sm text-text-muted">{selectedPin.beschreibung}</p>}
              {!kannBearbeiten ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                  <span>Priorität: {prioritaetLabel[selectedPin.prioritaet]}</span>
                  <span>Verantwortlich: {nameOf(selectedPin.verantwortlicher_id)}</span>
                  {selectedPin.faellig_am && <span>Fällig: {selectedPin.faellig_am}</span>}
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Status</label>
                  {werte.length > 0 ? (
                    <select
                      value={editStatusWertId}
                      onChange={(e) => setEditStatusWertId(e.target.value)}
                      className="field-input"
                    >
                      {werte.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.titel}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as MangelStatus)}
                      className="field-input"
                    >
                      {(['offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
                        <option key={s} value={s}>
                          {statusLabel[s]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="field-label">Priorität</label>
                  <select
                    value={editPrioritaet}
                    onChange={(e) => setEditPrioritaet(e.target.value as MangelPrioritaet)}
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
                  <label className="field-label">Verantwortlich</label>
                  <select
                    value={editVerantwortlicherId}
                    onChange={(e) => setEditVerantwortlicherId(e.target.value)}
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
                  <label className="field-label">Fällig am</label>
                  <input
                    type="date"
                    value={editFaelligAm}
                    onChange={(e) => setEditFaelligAm(e.target.value)}
                    className="field-input"
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Farbe</label>
                <FarbAuswahl value={editFarbe} onChange={setEditFarbe} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleUpdate} disabled={saving} className="btn-primary">
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
                <button onClick={handleUnpin} disabled={saving} className="btn-secondary">
                  Vom Plan entfernen
                </button>
              </div>
              </>
              )}
              <div className="border-t border-border pt-3">
                <MangelDetails mangelId={selectedPin.id} />
              </div>
            </div>
          )}

          {pins.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-text">
              {pins.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => {
                      setPendingPos(null)
                      setSelectedPin(m)
                    }}
                    className="flex w-full items-center gap-2 text-left hover:text-brand"
                  >
                    <span style={{ backgroundColor: pinFarbe(m, werte) }} className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" />
                    <span className="truncate">{m.titel}</span>
                    <span className="ml-auto flex-shrink-0 text-xs text-text-subtle">{nameOf(m.verantwortlicher_id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
