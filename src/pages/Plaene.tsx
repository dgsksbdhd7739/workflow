import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { supabase, uploadFile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { SignedImage } from '../components/SignedImage'
import { PdfThumbnail } from '../components/PdfThumbnail'
import type { Mangel, MangelStatus, Plan, StatusVorlageWert } from '../types/database'

const statusFarbeFallback: Record<MangelStatus, string> = {
  offen: '#dc2626',
  in_bearbeitung: '#d97706',
  erledigt: '#16a34a',
}

export function Plaene() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user, role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const kannLoeschen = role === 'admin' || role === 'planer'
  const [plaene, setPlaene] = useState<Plan[]>([])
  const [markierungen, setMarkierungen] = useState<Mangel[]>([])
  const [werteMap, setWerteMap] = useState<Record<string, StatusVorlageWert>>({})
  const [suche, setSuche] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const [{ data }, { data: markierungenData }, { data: werteData }] = await Promise.all([
      supabase.from('plaene').select('*').eq('baustelle_id', baustelleId).order('erstellt_am', { ascending: false }),
      supabase.from('maengel').select('*').eq('baustelle_id', baustelleId).not('plan_id', 'is', null),
      supabase.from('statusvorlage_werte').select('*'),
    ])
    setPlaene(data ?? [])
    setMarkierungen(markierungenData ?? [])
    const wMap: Record<string, StatusVorlageWert> = {}
    for (const w of werteData ?? []) wMap[w.id] = w
    setWerteMap(wMap)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelleId])

  const sucheNormalisiert = suche.trim().toLowerCase()
  const suchtreffer = sucheNormalisiert
    ? markierungen.filter((m) => m.titel.toLowerCase().includes(sucheNormalisiert))
    : []

  function markierungFarbe(m: Mangel) {
    if (m.farbe) return m.farbe
    const wert = m.status_wert_id ? werteMap[m.status_wert_id] : undefined
    if (wert) return wert.farbe
    return statusFarbeFallback[m.status]
  }

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user || !baustelleId) return
    setUploading(true)
    setFehler(null)

    const path = `${baustelleId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await uploadFile('plaene', path, file)
    if (uploadError) {
      setFehler(uploadError.message)
      setUploading(false)
      e.target.value = ''
      return
    }
    // Neue Plaene bekommen automatisch die projektweite Standard-Fortschrittsvorlage
    // (Montage, Verdrahtung FSA/DTA/RMZ, Inbetriebnahme, Abnahme), damit Admin/Planer
    // sie nicht jedes Mal manuell zuweisen muessen.
    const { data: standardVorlage } = await supabase
      .from('statusvorlagen')
      .select('id')
      .eq('ist_standard', true)
      .limit(1)
      .maybeSingle()
    const { error } = await supabase.from('plaene').insert({
      baustelle_id: baustelleId,
      name: file.name,
      datei_pfad: path,
      statusvorlage_id: standardVorlage?.id ?? null,
      erstellt_von: user.id,
    })
    if (error) setFehler(error.message)
    else load()
    setUploading(false)
    e.target.value = ''
  }

  const handleDelete = async (p: Plan) => {
    if (
      !window.confirm(
        `Plan "${p.name}" wirklich löschen? Markierungen darauf bleiben als Aufgaben erhalten, verlieren aber ihre Position.`,
      )
    ) {
      return
    }
    setFehler(null)
    const { error } = await supabase.from('plaene').delete().eq('id', p.id)
    if (error) {
      setFehler(error.message)
      return
    }
    await supabase.storage.from('plaene').remove([p.datei_pfad])
    load()
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Pläne</h1>
        {kannBearbeiten && (
          <label className="btn-primary cursor-pointer">
            {uploading ? 'Lädt hoch…' : '+ Plan hochladen'}
            <input type="file" accept="image/*,.pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        )}
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {markierungen.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" strokeWidth={2.25} />
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Markierung oder Aufgabe auf einem Plan suchen…"
            className="field-input pl-9 pr-9"
          />
          {suche && (
            <button
              onClick={() => setSuche('')}
              aria-label="Suche leeren"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          )}
          {sucheNormalisiert && (
            <div className="card absolute z-10 mt-1.5 max-h-72 w-full overflow-y-auto p-1.5">
              {suchtreffer.length === 0 ? (
                <p className="p-3 text-sm text-text-muted">Keine Markierung gefunden.</p>
              ) : (
                suchtreffer.map((m) => {
                  const plan = plaene.find((p) => p.id === m.plan_id)
                  return (
                    <Link
                      key={m.id}
                      to={`/baustellen/${baustelleId}/plaene/${m.plan_id}?markierung=${m.id}`}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-hover"
                    >
                      <span
                        style={{ backgroundColor: markierungFarbe(m) }}
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      />
                      <span className="min-w-0 flex-1 truncate text-text">{m.titel}</span>
                      <span className="flex-shrink-0 truncate text-xs text-text-subtle">{plan?.name}</span>
                    </Link>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : plaene.length === 0 ? (
        <p className="text-sm text-text-muted">
          Noch keine Pläne hochgeladen. Unterstützt werden Bilder und PDFs — auf beiden können Markierungen gesetzt
          werden.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {plaene.map((p) => (
            <li key={p.id} className="relative">
              <Link
                to={`/baustellen/${baustelleId}/plaene/${p.id}`}
                className="card block overflow-hidden transition-colors hover:border-brand/40"
              >
                <div className="aspect-square bg-surface-hover">
                  {p.datei_pfad.match(/\.(png|jpe?g|webp|gif)$/i) ? (
                    <SignedImage bucket="plaene" path={p.datei_pfad} alt={p.name} className="h-full w-full object-cover" />
                  ) : p.datei_pfad.match(/\.pdf$/i) ? (
                    <PdfThumbnail bucket="plaene" path={p.datei_pfad} className="h-full w-full" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">📄</div>
                  )}
                </div>
                <div className="truncate px-2 py-2 text-xs text-text-muted">{p.name}</div>
              </Link>
              {kannLoeschen && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleDelete(p)
                  }}
                  aria-label="Plan löschen"
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-red-600"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
