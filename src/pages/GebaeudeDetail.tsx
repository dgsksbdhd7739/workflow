import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Map as MapIcon, MapPin, Building2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { backend } from '../lib/backend'
import type { Gebaeude, Projekt } from '../types/database'

export function GebaeudeDetail() {
  const { id: projektId, gebaeudeId } = useParams<{ id: string; gebaeudeId: string }>()
  const { role } = useAuth()
  const [gebaeude, setGebaeude] = useState<Gebaeude | null>(null)
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    if (!projektId || !gebaeudeId) return
    let aktiv = true
    Promise.all([
      backend.from('gebaeude').select('*').eq('id', gebaeudeId).eq('projekt_id', projektId).maybeSingle(),
      backend.from('projekte').select('*').eq('id', projektId).maybeSingle(),
    ]).then(([gebaeudeRes, projektRes]) => {
      if (!aktiv) return
      if (gebaeudeRes.error || projektRes.error) {
        setFehler('Das Gebäude konnte nicht geladen werden. Bitte versuche es erneut.')
      } else if (!gebaeudeRes.data || !projektRes.data) {
        setFehler('Das Gebäude oder das Projekt wurde nicht gefunden oder du hast keinen Zugriff.')
      } else {
        setGebaeude(gebaeudeRes.data as Gebaeude)
        setProjekt(projektRes.data as Projekt)
      }
      setLoading(false)
    })
    return () => {
      aktiv = false
    }
  }, [projektId, gebaeudeId])

  if (loading) return <p className="p-6 text-sm text-text-muted">Gebäude wird geladen…</p>
  if (fehler || !gebaeude || !projekt || !projektId) {
    return (
      <div className="page">
        <p className="banner-error">{fehler ?? 'Gebäude nicht verfügbar.'}</p>
        {projektId && <Link className="btn-secondary mt-4" to={`/projekte/${projektId}`}>Zur Projektübersicht</Link>}
      </div>
    )
  }

  const kannBearbeiten = role === 'admin' || role === 'planer'

  return (
    <div className="page">
      <Link to={`/projekte/${projektId}`} className="mb-4 inline-flex items-center gap-2 text-sm text-text-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Zurück zum Projekt
      </Link>

      <section className="card mb-5 overflow-hidden">
        <div className="flex min-h-48 items-center justify-center bg-gradient-to-br from-brand-soft via-surface to-surface-hover p-8">
          <div className="flex h-32 w-32 items-center justify-center rounded-3xl border border-brand/20 bg-surface shadow-lg shadow-brand/10">
            <Building2 className="h-20 w-20 text-brand" strokeWidth={1.25} aria-hidden="true" />
          </div>
        </div>
        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Gebäude · {projekt.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-text">{gebaeude.name}</h1>
          {gebaeude.adresse && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-text-muted">
              <MapPin className="h-4 w-4" /> {gebaeude.adresse}
            </p>
          )}
          {gebaeude.beschreibung && <p className="mt-3 max-w-2xl text-sm text-text-muted">{gebaeude.beschreibung}</p>}
        </div>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Link to={`/projekte/${projektId}/plaene`} className="card flex items-center gap-3 p-4 transition-colors hover:border-brand/40 hover:bg-brand-soft/30">
          <MapIcon className="h-5 w-5 text-brand" />
          <span><span className="block text-sm font-medium text-text">Projektpläne öffnen</span><span className="text-xs text-text-muted">PDF- und Bildpläne mit Markierungen</span></span>
        </Link>
        <Link to={`/projekte/${projektId}/aufgaben`} className="card flex items-center gap-3 p-4 transition-colors hover:border-brand/40 hover:bg-brand-soft/30">
          <ClipboardList className="h-5 w-5 text-brand" />
          <span><span className="block text-sm font-medium text-text">Projektaufgaben öffnen</span><span className="text-xs text-text-muted">Aufgaben und Bearbeitungsstände</span></span>
        </Link>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-text">Gebäudeübersicht</h2>
        <p className="mt-1 text-sm text-text-muted">
          Dieses Gebäude ist angelegt und anklickbar. Die Zuordnung von Geschossen, Wohnungen und Aufgaben zu einzelnen Bereichen folgt als nächster Ausbauschritt.
        </p>
        {!kannBearbeiten && <p className="mt-3 text-xs text-text-subtle">Du kannst die Gebäudedaten ansehen. Änderungen sind Admin und Planer vorbehalten.</p>}
      </section>
    </div>
  )
}
