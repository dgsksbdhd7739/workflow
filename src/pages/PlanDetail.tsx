import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import type { Mangel, MangelPrioritaet, MangelStatus, Plan } from '../types/database'

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

function pinFarbe(m: Mangel) {
  return m.farbe ?? statusFarbe[m.status]
}

function FarbAuswahl({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full border px-2 py-1 text-xs ${
          value === null ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600'
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
          className={`h-6 w-6 rounded-full ${value === c ? 'ring-2 ring-offset-2 ring-gray-900' : ''}`}
        />
      ))}
    </div>
  )
}

export function PlanDetail() {
  const { id: baustelleId, planId } = useParams<{ id: string; planId: string }>()
  const { user } = useAuth()
  const { profiles, nameOf } = useProfiles()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pins, setPins] = useState<Mangel[]>([])
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)
  const [selectedPin, setSelectedPin] = useState<Mangel | null>(null)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfReady, setPdfReady] = useState(false)
  const [pdfError, setPdfError] = useState(false)

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

  const load = async () => {
    if (!planId) return
    const [{ data: planData }, { data: pinsData }] = await Promise.all([
      supabase.from('plaene').select('*').eq('id', planId).single(),
      supabase.from('maengel').select('*').eq('plan_id', planId).order('erstellt_am'),
    ])
    setPlan(planData)
    setPins(pinsData ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  const isPdf = Boolean(plan?.datei_url.match(/\.pdf$/i))

  useEffect(() => {
    if (!plan || !isPdf) return
    let cancelled = false
    setPdfReady(false)
    setPdfError(false)

    Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
      .then(([pdfjsLib, { default: workerUrl }]) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
        return pdfjsLib.getDocument({ url: plan.datei_url }).promise
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
  }, [plan, isPdf])

  useEffect(() => {
    if (!selectedPin) return
    setEditStatus(selectedPin.status)
    setEditPrioritaet(selectedPin.prioritaet)
    setEditVerantwortlicherId(selectedPin.verantwortlicher_id ?? '')
    setEditFaelligAm(selectedPin.faellig_am ?? '')
    setEditFarbe(selectedPin.farbe)
  }, [selectedPin])

  const resetNeuForm = () => {
    setTitel('')
    setBeschreibung('')
    setPrioritaet('mittel')
    setVerantwortlicherId('')
    setFaelligAm('')
    setFarbe(null)
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
    await supabase.from('maengel').insert({
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
      erstellt_von: user.id,
    })
    setSaving(false)
    setPendingPos(null)
    resetNeuForm()
    load()
  }

  const handleUpdate = async () => {
    if (!selectedPin) return
    setSaving(true)
    await supabase
      .from('maengel')
      .update({
        status: editStatus,
        prioritaet: editPrioritaet,
        verantwortlicher_id: editVerantwortlicherId || null,
        faellig_am: editFaelligAm || null,
        farbe: editFarbe,
      })
      .eq('id', selectedPin.id)
    setSaving(false)
    setSelectedPin(null)
    load()
  }

  const handleUnpin = async () => {
    if (!selectedPin) return
    setSaving(true)
    await supabase
      .from('maengel')
      .update({ plan_id: null, position_x: null, position_y: null })
      .eq('id', selectedPin.id)
    setSaving(false)
    setSelectedPin(null)
    load()
  }

  if (!plan) return <p className="p-6 text-sm text-gray-500">Lädt…</p>

  const isImage = plan.datei_url.match(/\.(png|jpe?g|webp|gif)$/i)
  const canMark = Boolean(isImage) || (isPdf && pdfReady)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to={`/baustellen/${baustelleId}/plaene`} className="mb-3 inline-block text-sm text-blue-600">
        ← Zurück zu Plänen
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">{plan.name}</h1>

      {isPdf && pdfError ? (
        <p className="text-sm text-gray-500">
          PDF konnte nicht geladen werden. <a className="text-blue-600" href={plan.datei_url} target="_blank" rel="noreferrer">Datei öffnen</a>
        </p>
      ) : !isImage && !isPdf ? (
        <p className="text-sm text-gray-500">
          Für dieses Dateiformat ist keine Markierung im Browser möglich. <a className="text-blue-600" href={plan.datei_url} target="_blank" rel="noreferrer">Datei öffnen</a>
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-gray-500">
            {canMark
              ? 'Auf den Plan tippen, um eine Aufgabe zu markieren. Vorhandene Markierung antippen zum Bearbeiten.'
              : 'PDF wird geladen…'}
          </p>
          <div
            onClick={canMark ? handlePlanClick : undefined}
            className="relative w-full cursor-crosshair overflow-hidden rounded-xl border border-gray-200 select-none"
          >
            {isPdf ? (
              <canvas ref={canvasRef} className="w-full select-none" />
            ) : (
              <img src={plan.datei_url} alt={plan.name} className="w-full select-none" draggable={false} />
            )}
            {isPdf && !pdfReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-500">
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
                  style={{ backgroundColor: pinFarbe(m) }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white shadow ring-2 ring-white"
                >
                  {m.status === 'erledigt' ? '✓' : '!'}
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

          {pendingPos && (
            <form onSubmit={handleCreate} className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-sm font-medium text-gray-900">Neue Aufgabe an dieser Position</div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Titel</label>
                <input
                  required
                  autoFocus
                  value={titel}
                  onChange={(e) => setTitel(e.target.value)}
                  placeholder="z. B. Tür einbauen"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Beschreibung</label>
                <textarea
                  value={beschreibung}
                  onChange={(e) => setBeschreibung(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Priorität</label>
                  <select
                    value={prioritaet}
                    onChange={(e) => setPrioritaet(e.target.value as MangelPrioritaet)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {(['niedrig', 'mittel', 'hoch'] as const).map((p) => (
                      <option key={p} value={p}>
                        {prioritaetLabel[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Fällig am</label>
                  <input
                    type="date"
                    value={faelligAm}
                    onChange={(e) => setFaelligAm(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Verantwortlich</label>
                <select
                  value={verantwortlicherId}
                  onChange={(e) => setVerantwortlicherId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <label className="mb-1 block text-sm font-medium text-gray-700">Farbe</label>
                <FarbAuswahl value={farbe} onChange={setFarbe} />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Speichert…' : 'Aufgabe anlegen'}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPos(null)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}

          {selectedPin && (
            <div className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-900">{selectedPin.titel}</div>
                <button onClick={() => setSelectedPin(null)} className="text-xs text-gray-500">
                  Schließen
                </button>
              </div>
              {selectedPin.beschreibung && <p className="text-sm text-gray-600">{selectedPin.beschreibung}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as MangelStatus)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {(['offen', 'in_bearbeitung', 'erledigt'] as const).map((s) => (
                      <option key={s} value={s}>
                        {statusLabel[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Priorität</label>
                  <select
                    value={editPrioritaet}
                    onChange={(e) => setEditPrioritaet(e.target.value as MangelPrioritaet)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {(['niedrig', 'mittel', 'hoch'] as const).map((p) => (
                      <option key={p} value={p}>
                        {prioritaetLabel[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Verantwortlich</label>
                  <select
                    value={editVerantwortlicherId}
                    onChange={(e) => setEditVerantwortlicherId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Fällig am</label>
                  <input
                    type="date"
                    value={editFaelligAm}
                    onChange={(e) => setEditFaelligAm(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Farbe</label>
                <FarbAuswahl value={editFarbe} onChange={setEditFarbe} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
                <button
                  onClick={handleUnpin}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 disabled:opacity-50"
                >
                  Vom Plan entfernen
                </button>
              </div>
            </div>
          )}

          {pins.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-gray-700">
              {pins.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => {
                      setPendingPos(null)
                      setSelectedPin(m)
                    }}
                    className="flex w-full items-center gap-2 text-left hover:text-blue-700"
                  >
                    <span style={{ backgroundColor: pinFarbe(m) }} className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full" />
                    <span className="truncate">{m.titel}</span>
                    <span className="ml-auto flex-shrink-0 text-xs text-gray-400">{nameOf(m.verantwortlicher_id)}</span>
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
