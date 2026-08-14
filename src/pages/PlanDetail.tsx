import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Plan, PlanMarkierung } from '../types/database'

export function PlanDetail() {
  const { id: baustelleId, planId } = useParams<{ id: string; planId: string }>()
  const { user } = useAuth()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [markierungen, setMarkierungen] = useState<PlanMarkierung[]>([])
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null)
  const [notiz, setNotiz] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!planId) return
    const [{ data: planData }, { data: markierungenData }] = await Promise.all([
      supabase.from('plaene').select('*').eq('id', planId).single(),
      supabase.from('plan_markierungen').select('*').eq('plan_id', planId).order('erstellt_am'),
    ])
    setPlan(planData)
    setMarkierungen(markierungenData ?? [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  const handleImageClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPendingPos({ x, y })
    setNotiz('')
  }

  const savePin = async () => {
    if (!pendingPos || !user || !planId) return
    setSaving(true)
    await supabase.from('plan_markierungen').insert({
      plan_id: planId,
      x: pendingPos.x,
      y: pendingPos.y,
      notiz: notiz || null,
      erstellt_von: user.id,
    })
    setSaving(false)
    setPendingPos(null)
    setNotiz('')
    load()
  }

  if (!plan) return <p className="p-6 text-sm text-gray-500">Lädt…</p>

  const isImage = plan.datei_url.match(/\.(png|jpe?g|webp|gif)$/i)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to={`/baustellen/${baustelleId}/plaene`} className="mb-3 inline-block text-sm text-blue-600">
        ← Zurück zu Plänen
      </Link>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">{plan.name}</h1>

      {!isImage ? (
        <p className="text-sm text-gray-500">
          Für dieses Dateiformat ist keine Markierung im Browser möglich. <a className="text-blue-600" href={plan.datei_url} target="_blank" rel="noreferrer">Datei öffnen</a>
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-gray-500">Auf den Plan tippen, um eine Markierung zu setzen.</p>
          <div
            onClick={handleImageClick}
            className="relative w-full cursor-crosshair overflow-hidden rounded-xl border border-gray-200 select-none"
          >
            <img src={plan.datei_url} alt={plan.name} className="w-full select-none" draggable={false} />
            {markierungen.map((m) => (
              <div
                key={m.id}
                title={m.notiz ?? ''}
                style={{ left: `${m.x}%`, top: `${m.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-full"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow">
                  !
                </div>
              </div>
            ))}
            {pendingPos && (
              <div
                style={{ left: `${pendingPos.x}%`, top: `${pendingPos.y}%` }}
                className="absolute -translate-x-1/2 -translate-y-full"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow animate-pulse">
                  +
                </div>
              </div>
            )}
          </div>

          {pendingPos && (
            <div className="mt-3 flex gap-2 rounded-xl border border-gray-200 bg-white p-3">
              <input
                autoFocus
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                placeholder="Notiz zur Markierung"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={savePin}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Setzen
              </button>
              <button
                onClick={() => setPendingPos(null)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600"
              >
                Abbrechen
              </button>
            </div>
          )}

          {markierungen.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-gray-700">
              {markierungen.map((m) => (
                <li key={m.id}>• {m.notiz || 'Ohne Notiz'}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
