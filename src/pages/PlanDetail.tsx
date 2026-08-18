import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type TouchEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { supabase, getSignedUrl } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { MangelDetails } from '../components/MangelDetails'
import { Arbeitszeit } from '../components/Arbeitszeit'
import type { Mangel, MangelPrioritaet, MangelStatus, Plan, StatusVorlageWert } from '../types/database'

const statusLabel: Record<MangelStatus, string> = {
  offen: 'Stopp',
  in_bearbeitung: 'In Arbeit',
  erledigt: 'Abgeschlossen',
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

function relPos(clientX: number, clientY: number, rect: DOMRect) {
  const x = ((clientX - rect.left) / rect.width) * 100
  const y = ((clientY - rect.top) / rect.height) * 100
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
}

const MIN_ZOOM = 1
const MAX_ZOOM = 10

function clampPan(pan: { x: number; y: number }, zoom: number, viewportW: number, viewportH: number) {
  const scaledW = viewportW * zoom
  const scaledH = viewportH * zoom
  const minX = Math.min(0, viewportW - scaledW)
  const minY = Math.min(0, viewportH - scaledH)
  return {
    x: Math.min(0, Math.max(minX, pan.x)),
    y: Math.min(0, Math.max(minY, pan.y)),
  }
}

export function PlanDetail() {
  const { id: baustelleId, planId } = useParams<{ id: string; planId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const kannLoeschen = role === 'admin' || role === 'planer'
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pins, setPins] = useState<Mangel[]>([])
  const [pinSuche, setPinSuche] = useState('')
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number; x2?: number; y2?: number } | null>(null)
  const [selectedPin, setSelectedPin] = useState<Mangel | null>(null)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfReady, setPdfReady] = useState(false)
  const [pdfError, setPdfError] = useState(false)
  const [datenUrl, setDatenUrl] = useState<string | null>(null)
  const [zeigePunkte, setZeigePunkte] = useState(true)
  const [zeichenModus, setZeichenModus] = useState<'punkt' | 'rechteck'>('punkt')
  const [rechteckStart, setRechteckStart] = useState<{ x: number; y: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panDragRef = useRef<{ startX: number; startY: number; startPan: { x: number; y: number }; dragging: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const pinchRef = useRef<{ dist: number; zoom: number; pan: { x: number; y: number }; midX: number; midY: number } | null>(null)
  const planSectionRef = useRef<HTMLDivElement>(null)
  const [istVollbild, setIstVollbild] = useState(false)

  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [status, setStatus] = useState<MangelStatus>('in_bearbeitung')
  const [prioritaet, setPrioritaet] = useState<MangelPrioritaet>('mittel')

  const [editStatus, setEditStatus] = useState<MangelStatus>('offen')
  const [editPrioritaet, setEditPrioritaet] = useState<MangelPrioritaet>('mittel')

  const [statusWertId, setStatusWertId] = useState('')
  const [werte, setWerte] = useState<StatusVorlageWert[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  const updateZoomPan = (nextZoom: number, nextPan: { x: number; y: number }) => {
    zoomRef.current = nextZoom
    panRef.current = nextPan
    setZoom(nextZoom)
    setPan(nextPan)
  }

  const resetZoom = () => updateZoomPan(1, { x: 0, y: 0 })

  const applyZoom = (newZoomRaw: number, focalClientX: number, focalClientY: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoomRaw))
    const rect = viewport.getBoundingClientRect()
    const fx = focalClientX - rect.left
    const fy = focalClientY - rect.top
    const prevZoom = zoomRef.current
    const prevPan = panRef.current
    const contentX = (fx - prevPan.x) / prevZoom
    const contentY = (fy - prevPan.y) / prevZoom
    const nextPan = clampPan({ x: fx - contentX * newZoom, y: fy - contentY * newZoom }, newZoom, rect.width, rect.height)
    updateZoomPan(newZoom, nextPan)
  }

  const applyZoomAtCenter = (newZoom: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    applyZoom(newZoom, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

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
    resetZoom()
    setPinSuche('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  // Maus-Pan robust ueber Fenster-Listener statt nur auf dem Plan-Element:
  // beim Ziehen verlaesst der Cursor bei starkem Zoom schnell den sichtbaren
  // (per overflow:hidden geclippten) Ausschnitt.
  useEffect(() => {
    const handleMove = (e: globalThis.MouseEvent) => {
      const ps = panDragRef.current
      if (!ps) return
      const dx = e.clientX - ps.startX
      const dy = e.clientY - ps.startY
      if (!ps.dragging && Math.hypot(dx, dy) > 4) {
        ps.dragging = true
        setIsPanning(true)
      }
      if (ps.dragging) {
        const viewport = viewportRef.current
        if (!viewport) return
        const rect = viewport.getBoundingClientRect()
        const nextPan = clampPan({ x: ps.startPan.x + dx, y: ps.startPan.y + dy }, zoomRef.current, rect.width, rect.height)
        panRef.current = nextPan
        setPan(nextPan)
      }
    }
    const handleUp = () => {
      const ps = panDragRef.current
      if (ps?.dragging) suppressClickRef.current = true
      panDragRef.current = null
      setIsPanning(false)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  // Mausrad-Zoom, zentriert auf den Cursor: braucht einen nativen,
  // nicht-passiven Listener, damit preventDefault() das Seiten-Scrollen
  // zuverlaessig unterdrueckt (React haengt onWheel standardmaessig passiv ein).
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * 0.0015)
      applyZoom(zoomRef.current * factor, e.clientX, e.clientY)
    }
    viewport.addEventListener('wheel', handler, { passive: false })
    return () => viewport.removeEventListener('wheel', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datenUrl])

  // Sprungziel aus der planuebergreifenden Suche (Plaene.tsx): oeffnet die
  // per ?markierung=<id> verlinkte Markierung automatisch.
  useEffect(() => {
    const zielId = searchParams.get('markierung')
    if (!zielId || pins.length === 0) return
    const ziel = pins.find((p) => p.id === zielId)
    if (ziel) {
      setPendingPos(null)
      setSelectedPin(ziel)
      planSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('markierung')
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins])

  useEffect(() => {
    const handler = () => setIstVollbild(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleVollbild = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      planSectionRef.current?.requestFullscreen()
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPin])

  const standardWertId = () => werte.find((w) => w.ist_standard)?.id ?? werte[0]?.id ?? ''

  const resetNeuForm = () => {
    setTitel('')
    setBeschreibung('')
    setStatus('in_bearbeitung')
    setPrioritaet('mittel')
    setStatusWertId(standardWertId())
  }

  const handlePlanClick = (e: MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (zeichenModus !== 'punkt' || !canMark) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = relPos(e.clientX, e.clientY, rect)
    setSelectedPin(null)
    resetNeuForm()
    setPendingPos(pos)
  }

  const handleContentMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (zeichenModus === 'rechteck' && canMark) {
      handleRectMouseDown(e)
      return
    }
    if (e.button !== 0) return
    panDragRef.current = { startX: e.clientX, startY: e.clientY, startPan: panRef.current, dragging: false }
  }

  const handlePinClick = (e: MouseEvent, pin: Mangel) => {
    e.stopPropagation()
    setPendingPos(null)
    setSelectedPin(pin)
  }

  const verwerfeKleinesRechteck = () => {
    setPendingPos((prev) => {
      if (!prev || prev.x2 === undefined || prev.y2 === undefined) return prev
      const breite = Math.abs(prev.x2 - prev.x)
      const hoehe = Math.abs(prev.y2 - prev.y)
      return breite < 1 && hoehe < 1 ? null : prev
    })
  }

  const handleRectMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (zeichenModus !== 'rechteck') return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = relPos(e.clientX, e.clientY, rect)
    setSelectedPin(null)
    resetNeuForm()
    setRechteckStart(pos)
    setPendingPos({ x: pos.x, y: pos.y, x2: pos.x, y2: pos.y })
  }

  const handleRectMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!rechteckStart) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = relPos(e.clientX, e.clientY, rect)
    setPendingPos({ x: rechteckStart.x, y: rechteckStart.y, x2: pos.x, y2: pos.y })
  }

  const handleRectMouseUp = () => {
    if (!rechteckStart) return
    setRechteckStart(null)
    verwerfeKleinesRechteck()
  }

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const t0 = e.touches[0]
      const t1 = e.touches[1]
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
      pinchRef.current = {
        dist,
        zoom: zoomRef.current,
        pan: panRef.current,
        midX: (t0.clientX + t1.clientX) / 2,
        midY: (t0.clientY + t1.clientY) / 2,
      }
      panDragRef.current = null
      return
    }
    if (e.touches.length === 1) {
      if (zeichenModus === 'rechteck' && canMark) {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        const pos = relPos(e.touches[0].clientX, e.touches[0].clientY, rect)
        setSelectedPin(null)
        resetNeuForm()
        setRechteckStart(pos)
        setPendingPos({ x: pos.x, y: pos.y, x2: pos.x, y2: pos.y })
        return
      }
      panDragRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startPan: panRef.current,
        dragging: false,
      }
    }
  }

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const t0 = e.touches[0]
      const t1 = e.touches[1]
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY)
      const midX = (t0.clientX + t1.clientX) / 2
      const midY = (t0.clientY + t1.clientY) / 2
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      const start = pinchRef.current
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.zoom * (dist / start.dist)))
      const fx0 = start.midX - rect.left
      const fy0 = start.midY - rect.top
      const contentX = (fx0 - start.pan.x) / start.zoom
      const contentY = (fy0 - start.pan.y) / start.zoom
      const fx1 = midX - rect.left
      const fy1 = midY - rect.top
      const nextPan = clampPan({ x: fx1 - contentX * newZoom, y: fy1 - contentY * newZoom }, newZoom, rect.width, rect.height)
      updateZoomPan(newZoom, nextPan)
      return
    }
    if (e.touches.length === 1 && rechteckStart) {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const pos = relPos(e.touches[0].clientX, e.touches[0].clientY, rect)
      setPendingPos({ x: rechteckStart.x, y: rechteckStart.y, x2: pos.x, y2: pos.y })
      return
    }
    if (e.touches.length === 1 && panDragRef.current) {
      const ps = panDragRef.current
      const dx = e.touches[0].clientX - ps.startX
      const dy = e.touches[0].clientY - ps.startY
      if (!ps.dragging && Math.hypot(dx, dy) > 4) ps.dragging = true
      if (ps.dragging) {
        e.preventDefault()
        const viewport = viewportRef.current
        if (!viewport) return
        const rect = viewport.getBoundingClientRect()
        const nextPan = clampPan({ x: ps.startPan.x + dx, y: ps.startPan.y + dy }, zoomRef.current, rect.width, rect.height)
        panRef.current = nextPan
        setPan(nextPan)
      }
    }
  }

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) pinchRef.current = null
    if (e.touches.length === 0) {
      if (rechteckStart) {
        setRechteckStart(null)
        verwerfeKleinesRechteck()
      }
      if (panDragRef.current?.dragging) suppressClickRef.current = true
      panDragRef.current = null
    }
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
      plan_id: planId,
      position_x: pendingPos.x,
      position_y: pendingPos.y,
      position_x2: pendingPos.x2 ?? null,
      position_y2: pendingPos.y2 ?? null,
      status_wert_id: werte.length > 0 ? statusWertId || null : null,
      status,
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
    const { error } = await supabase
      .from('maengel')
      .update({
        status: editStatus,
        prioritaet: editPrioritaet,
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
    if (!window.confirm('Markierung wirklich vom Plan entfernen? Die Aufgabe bleibt in der Aufgaben-Liste erhalten.')) return
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

  const handleDeleteMangel = async () => {
    if (!selectedPin) return
    if (!window.confirm('Aufgabe wirklich endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return
    setSaving(true)
    setFehler(null)
    const { error } = await supabase.from('maengel').delete().eq('id', selectedPin.id)
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
  const vorschauFarbe = werte.find((w) => w.id === statusWertId)?.farbe ?? statusFarbe[status]

  return (
    <div className="page">
      <Link to={`/baustellen/${baustelleId}/plaene`} className="mb-3 inline-block text-sm text-brand">
        ← Zurück zu Plänen
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-text">{plan.name}</h1>

      {fehler && <p className="banner-error mb-3">Fehler: {fehler}</p>}

      {isPdf && pdfError ? (
        <p className="text-sm text-text-muted">
          PDF konnte nicht geladen werden. <a className="text-brand" href={datenUrl} target="_blank" rel="noreferrer">Datei öffnen</a>
        </p>
      ) : !isImage && !isPdf ? (
        <p className="text-sm text-text-muted">
          Für dieses Dateiformat ist keine Markierung im Browser möglich. <a className="text-brand" href={datenUrl} target="_blank" rel="noreferrer">Datei öffnen</a>
        </p>
      ) : (
        <div ref={planSectionRef} className={istVollbild ? 'h-screen overflow-y-auto bg-bg p-4' : ''}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-muted">
              {!canMark
                ? 'PDF wird geladen…'
                : zeichenModus === 'rechteck'
                  ? 'Auf dem Plan ziehen, um ein Rechteck (z. B. um eine Tür) zu markieren.'
                  : 'Auf den Plan tippen, um eine Aufgabe zu markieren. Vorhandene Markierung antippen zum Bearbeiten.'}
            </p>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={toggleVollbild}
                aria-label={istVollbild ? 'Vollbild beenden' : 'Vollbild anzeigen'}
                title={istVollbild ? 'Vollbild beenden' : 'Vollbild anzeigen (am PC)'}
                className="hidden h-7 w-7 rounded-lg border border-border-strong text-sm text-text md:inline-flex md:items-center md:justify-center"
              >
                {istVollbild ? '✕' : '⛶'}
              </button>
              <button
                type="button"
                onClick={() => setZeigePunkte((v) => !v)}
                aria-label={zeigePunkte ? 'Alle Markierungen ausblenden' : 'Alle Markierungen einblenden'}
                title={zeigePunkte ? 'Markierungen ausblenden' : 'Markierungen einblenden'}
                className="h-7 w-7 rounded-lg border border-border-strong text-sm text-text"
              >
                {zeigePunkte ? '🙈' : '👁️'}
              </button>
              {canMark && (
                <button
                  type="button"
                  onClick={() => {
                    setZeichenModus((m) => (m === 'rechteck' ? 'punkt' : 'rechteck'))
                    setPendingPos(null)
                    setRechteckStart(null)
                  }}
                  aria-label="Rechteck-Werkzeug"
                  title="Rechteck um eine Tür zeichnen"
                  className={`h-7 w-7 rounded-lg border text-sm ${
                    zeichenModus === 'rechteck'
                      ? 'border-brand bg-brand-soft text-brand-text'
                      : 'border-border-strong text-text'
                  }`}
                >
                  ▭
                </button>
              )}
              <span className="mx-1 h-5 w-px bg-border" />
              <button
                type="button"
                onClick={() => applyZoomAtCenter(zoomRef.current / 1.4)}
                disabled={zoom <= MIN_ZOOM + 0.001}
                className="h-7 w-7 rounded-lg border border-border-strong text-sm font-medium text-text disabled:opacity-30"
              >
                −
              </button>
              <span className="w-14 text-center text-xs text-text-muted">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => applyZoomAtCenter(zoomRef.current * 1.4)}
                disabled={zoom >= MAX_ZOOM - 0.001}
                className="h-7 w-7 rounded-lg border border-border-strong text-sm font-medium text-text disabled:opacity-30"
              >
                +
              </button>
              {zoom !== 1 && (
                <button
                  type="button"
                  onClick={resetZoom}
                  className="ml-1 text-xs font-medium text-brand"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
          </div>
          <div ref={viewportRef} className="w-full overflow-hidden rounded-xl border border-border">
            <div
              onClick={handlePlanClick}
              onMouseDown={handleContentMouseDown}
              onMouseMove={(e) => rechteckStart && handleRectMouseMove(e)}
              onMouseUp={() => rechteckStart && handleRectMouseUp()}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="relative select-none touch-none"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                cursor: isPanning ? 'grabbing' : zoom > MIN_ZOOM + 0.001 ? 'grab' : canMark ? 'crosshair' : 'default',
              }}
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
              {zeigePunkte &&
                pins.map((m) => {
                  const gedimmt = Boolean(pinSuche.trim()) && !m.titel.toLowerCase().includes(pinSuche.trim().toLowerCase())
                  return m.position_x2 != null && m.position_y2 != null ? (
                    <div
                      key={m.id}
                      onClick={(e) => handlePinClick(e, m)}
                      style={{
                        left: `${Math.min(m.position_x!, m.position_x2)}%`,
                        top: `${Math.min(m.position_y!, m.position_y2)}%`,
                        width: `${Math.abs(m.position_x2 - m.position_x!)}%`,
                        height: `${Math.abs(m.position_y2 - m.position_y!)}%`,
                        borderColor: pinFarbe(m, werte),
                        borderStyle: 'solid',
                        borderWidth: 3,
                        backgroundColor: `${pinFarbe(m, werte)}33`,
                        zIndex: 5,
                        opacity: gedimmt ? 0.25 : 1,
                        transition: 'opacity 150ms',
                      }}
                      className="absolute cursor-pointer"
                    >
                      <span
                        style={{ backgroundColor: pinFarbe(m, werte) }}
                        className="absolute -top-5 left-0 max-w-[10rem] truncate rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow"
                      >
                        {istLetzterWert(m, werte) ? '✓ ' : ''}
                        {m.titel}
                      </span>
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      onClick={(e) => handlePinClick(e, m)}
                      style={{ left: `${m.position_x}%`, top: `${m.position_y}%`, opacity: gedimmt ? 0.25 : 1, transition: 'opacity 150ms' }}
                      className="absolute -translate-x-1/2 -translate-y-full cursor-pointer"
                    >
                      <div className="flex flex-col items-center">
                        <div
                          style={{ backgroundColor: pinFarbe(m, werte) }}
                          className="max-w-[10rem] truncate rounded-md px-2 py-1 text-xs font-semibold text-white shadow-md ring-1 ring-white/70"
                        >
                          {istLetzterWert(m, werte) ? '✓ ' : ''}
                          {m.titel}
                        </div>
                        <div
                          style={{ borderTopColor: pinFarbe(m, werte) }}
                          className="h-0 w-0 border-x-[6px] border-x-transparent border-t-[7px]"
                        />
                      </div>
                    </div>
                  )
                })}
              {pendingPos && pendingPos.x2 !== undefined && pendingPos.y2 !== undefined ? (
                <div
                  style={{
                    left: `${Math.min(pendingPos.x, pendingPos.x2)}%`,
                    top: `${Math.min(pendingPos.y, pendingPos.y2)}%`,
                    width: `${Math.abs(pendingPos.x2 - pendingPos.x)}%`,
                    height: `${Math.abs(pendingPos.y2 - pendingPos.y)}%`,
                    borderColor: vorschauFarbe,
                    borderStyle: 'solid',
                    borderWidth: 3,
                    backgroundColor: `${vorschauFarbe}33`,
                    zIndex: 5,
                  }}
                  className="absolute animate-pulse"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPendingPos(null)
                      setRechteckStart(null)
                    }}
                    className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] text-white"
                    aria-label="Rechteck verwerfen"
                  >
                    🗑
                  </button>
                </div>
              ) : (
                pendingPos && (
                  <div
                    style={{ left: `${pendingPos.x}%`, top: `${pendingPos.y}%` }}
                    className="absolute -translate-x-1/2 -translate-y-full"
                  >
                    <div className="relative flex animate-pulse flex-col items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingPos(null)
                        }}
                        className="absolute -right-3 -top-3 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[10px] text-white"
                        aria-label="Markierung verwerfen"
                      >
                        🗑
                      </button>
                      <div
                        style={{ backgroundColor: vorschauFarbe }}
                        className="max-w-[10rem] truncate rounded-md px-2 py-1 text-xs font-semibold text-white shadow-md ring-1 ring-white/70"
                      >
                        {titel || 'Neue Markierung'}
                      </div>
                      <div
                        style={{ borderTopColor: vorschauFarbe }}
                        className="h-0 w-0 border-x-[6px] border-x-transparent border-t-[7px]"
                      />
                    </div>
                  </div>
                )
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
              <div>
                <label className="field-label">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as MangelStatus)} className="field-input">
                  {(['offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </select>
              </div>
              {werte.length > 0 && (
                <div>
                  <label className="field-label">Fortschritt</label>
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
              <Arbeitszeit mangel={selectedPin} onChange={load} />
              {!kannBearbeiten ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                  <span>Priorität: {prioritaetLabel[selectedPin.prioritaet]}</span>
                </div>
              ) : (
              <>
              <div>
                <label className="field-label">Status</label>
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
              <div className="flex flex-wrap gap-2">
                <button onClick={handleUpdate} disabled={saving} className="btn-primary">
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
                <button onClick={handleUnpin} disabled={saving} className="btn-secondary">
                  Vom Plan entfernen
                </button>
                {kannLoeschen && (
                  <button
                    onClick={handleDeleteMangel}
                    disabled={saving}
                    className="btn-secondary text-red-600 dark:text-red-400"
                  >
                    Endgültig löschen
                  </button>
                )}
              </div>
              </>
              )}
              <div className="border-t border-border pt-3">
                <MangelDetails
                  mangelId={selectedPin.id}
                  werte={werte}
                  vorlageId={plan.statusvorlage_id}
                  onChange={load}
                />
              </div>
            </div>
          )}

          {pins.length > 0 && (
            <div className="mt-4">
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-subtle" strokeWidth={2.25} />
                <input
                  value={pinSuche}
                  onChange={(e) => setPinSuche(e.target.value)}
                  placeholder="Markierung auf diesem Plan suchen…"
                  className="field-input py-1.5 pl-8 pr-8 text-xs"
                />
                {pinSuche && (
                  <button
                    onClick={() => setPinSuche('')}
                    aria-label="Suche leeren"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                )}
              </div>
              {(() => {
                const gefilterteListe = pinSuche.trim()
                  ? pins.filter((m) => m.titel.toLowerCase().includes(pinSuche.trim().toLowerCase()))
                  : pins
                return gefilterteListe.length === 0 ? (
                  <p className="text-xs text-text-subtle">Keine Markierung gefunden.</p>
                ) : (
                  <ul className="space-y-1 text-sm text-text">
                    {gefilterteListe.map((m) => (
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
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
