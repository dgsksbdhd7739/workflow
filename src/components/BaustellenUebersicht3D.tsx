import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { backend } from '../lib/backend'
import { STATUS_FARBE, STATUS_TEXT, gebaeudeAuswerten, type BereichAuswertung, type BereichStatus } from '../lib/gebaeude3d'
import type { Aufgabe, Einheit, Gebaeude, Geschoss, Termin } from '../types/database'

// three.js nur laden, wenn die Ansicht wirklich angezeigt wird.
const Baustelle3D = lazy(() => import('./Baustelle3D'))

/**
 * 3D-Baustellenansicht fuer Projekt-Dashboard und Aufgabenseite. Laedt
 * Geschosse, Einheiten, Aufgaben und Termine selbst, damit die Seiten schlank
 * bleiben. Ohne onGebaeude oeffnet ein Klick das Gebaeude.
 */
export function BaustellenUebersicht3D({
  projektId,
  gebaeude,
  onGebaeude,
  hinweis,
}: {
  projektId: string
  gebaeude: Gebaeude[]
  onGebaeude?: (id: string) => void
  hinweis?: string
}) {
  const navigate = useNavigate()
  const [geschosse, setGeschosse] = useState<Geschoss[]>([])
  const [einheiten, setEinheiten] = useState<Einheit[]>([])
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [termine, setTermine] = useState<Termin[]>([])

  useEffect(() => {
    let aktiv = true
    Promise.all([
      backend.from('geschosse').select('*').eq('projekt_id', projektId),
      backend.from('einheiten').select('*').eq('projekt_id', projektId),
      backend.from('aufgaben').select('*').eq('projekt_id', projektId),
      backend.from('termine').select('*').eq('projekt_id', projektId),
    ]).then(([g, e, a, t]) => {
      if (!aktiv) return
      setGeschosse((g.data ?? []) as Geschoss[])
      setEinheiten((e.data ?? []) as Einheit[])
      setAufgaben((a.data ?? []) as Aufgabe[])
      setTermine((t.data ?? []) as Termin[])
    })
    return () => {
      aktiv = false
    }
  }, [projektId, gebaeude])

  const auswertung = useMemo(() => {
    const karte = new Map<string, BereichAuswertung>()
    for (const g of gebaeude) {
      const eigene = geschosse.filter((s) => s.gebaeude_id === g.id)
      const ids = new Set(eigene.map((s) => s.id))
      karte.set(g.id, gebaeudeAuswerten(g.id, eigene, einheiten.filter((e) => ids.has(e.geschoss_id)), aufgaben, termine).gesamt)
    }
    return karte
  }, [gebaeude, geschosse, einheiten, aufgaben, termine])

  return (
    <div className="card relative mb-3 h-[26rem] overflow-hidden sm:h-[34rem] lg:h-[40rem]">
      <Suspense fallback={<p className="p-6 text-sm text-text-muted">3D-Ansicht wird geladen…</p>}>
        <Baustelle3D
          gebaeude={gebaeude}
          geschosse={geschosse}
          auswertung={auswertung}
          onOeffnen={onGebaeude ?? ((id) => navigate(`/projekte/${projektId}/gebaeude/${id}`))}
        />
      </Suspense>
      {hinweis && (
        <p className="pointer-events-none absolute right-3 top-3 rounded bg-surface/90 px-2 py-1 text-[11px] text-text-subtle shadow-sm">{hinweis}</p>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-surface/90 px-2.5 py-1.5 text-[11px] text-text-muted shadow-sm">
        {(Object.keys(STATUS_TEXT) as BereichStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: STATUS_FARBE[s] }} /> {STATUS_TEXT[s]}
          </span>
        ))}
      </div>
    </div>
  )
}
