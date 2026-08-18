import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { exportMaterialPdf } from '../lib/pdf'
import type { Baustelle, MangelMaterial } from '../types/database'

interface MaterialZeile extends MangelMaterial {
  mangel_titel: string
  plan_id: string | null
}

export function Material() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const [baustelle, setBaustelle] = useState<Baustelle | null>(null)
  const [zeilen, setZeilen] = useState<MaterialZeile[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const [{ data: baustelleData }, { data: maengelData }] = await Promise.all([
      supabase.from('baustellen').select('*').eq('id', baustelleId).single(),
      supabase.from('maengel').select('id, titel, plan_id').eq('baustelle_id', baustelleId),
    ])
    setBaustelle(baustelleData)
    const mangelIds = (maengelData ?? []).map((m) => m.id)
    const titelMap = Object.fromEntries((maengelData ?? []).map((m) => [m.id, m.titel]))
    const planMap = Object.fromEntries((maengelData ?? []).map((m) => [m.id, m.plan_id]))

    if (mangelIds.length === 0) {
      setZeilen([])
      setLoading(false)
      return
    }

    const { data: materialData } = await supabase
      .from('mangel_material')
      .select('*')
      .in('mangel_id', mangelIds)
      .order('bezeichnung')

    setZeilen(
      (materialData ?? []).map((m) => ({
        ...m,
        mangel_titel: titelMap[m.mangel_id] ?? '—',
        plan_id: planMap[m.mangel_id] ?? null,
      })),
    )
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelleId])

  const summe = useMemo(() => {
    const map = new Map<string, { bezeichnung: string; einheit: string | null; menge: number; anzahl: number }>()
    for (const z of zeilen) {
      const key = `${z.bezeichnung.trim().toLowerCase()}|${z.einheit ?? ''}`
      const eintrag = map.get(key) ?? { bezeichnung: z.bezeichnung, einheit: z.einheit, menge: 0, anzahl: 0 }
      eintrag.menge += z.menge
      eintrag.anzahl += 1
      map.set(key, eintrag)
    }
    return [...map.values()].sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung))
  }, [zeilen])

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Material</h1>
          <p className="text-xs text-text-muted">
            Alle Materiallisten der Aufgaben/Markierungen dieses Projekts, zusammengefasst.
          </p>
        </div>
        {baustelle && zeilen.length > 0 && (
          <button onClick={() => exportMaterialPdf(baustelle, summe)} className="btn-secondary">
            PDF exportieren
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : zeilen.length === 0 ? (
        <p className="text-sm text-text-muted">
          Noch kein Material erfasst. Material wird direkt an einer Aufgabe/Markierung unter "Fortschritt" eingetragen.
        </p>
      ) : (
        <>
          <div className="card mb-6 overflow-x-auto p-4">
            <h2 className="mb-3 text-sm font-medium text-text">Gesamtbedarf</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-subtle">
                  <th className="pb-2 font-medium">Material</th>
                  <th className="pb-2 font-medium">Menge</th>
                  <th className="pb-2 font-medium">Aus wie vielen Punkten</th>
                </tr>
              </thead>
              <tbody>
                {summe.map((s) => (
                  <tr key={`${s.bezeichnung}-${s.einheit}`} className="border-b border-border last:border-0">
                    <td className="py-1.5 text-text">{s.bezeichnung}</td>
                    <td className="py-1.5 text-text">
                      {s.menge}
                      {s.einheit ? ` ${s.einheit}` : ''}
                    </td>
                    <td className="py-1.5 text-text-muted">{s.anzahl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 text-sm font-medium text-text">Details je Punkt</h2>
          <ul className="space-y-1.5">
            {zeilen.map((z) => (
              <li
                key={z.id}
                className="card flex items-center justify-between gap-3 p-3 text-sm"
              >
                <div className="min-w-0">
                  <div className={`truncate text-text ${z.erledigt ? 'text-text-subtle line-through' : ''}`}>
                    {z.bezeichnung}
                    <span className="ml-1 text-xs text-text-subtle">
                      ({z.menge}
                      {z.einheit ? ` ${z.einheit}` : ''})
                    </span>
                  </div>
                  <div className="truncate text-xs text-text-subtle">
                    {z.mangel_titel}
                    {z.plan_id && baustelleId && (
                      <>
                        {' · '}
                        <Link to={`/baustellen/${baustelleId}/plaene/${z.plan_id}`} className="text-brand">
                          Plan ansehen
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                {z.erledigt && <span className="flex-shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ erledigt</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
