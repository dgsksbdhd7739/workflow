import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, FileText, FolderOpen, Trash2 } from 'lucide-react'
import { supabase, getSignedUrl, uploadFile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { formatDatum } from '../lib/datum'
import type { Dokument, DokumentKategorie, Mangel } from '../types/database'

function UploadForm({
  kategorie,
  baustelleId,
  onDone,
}: {
  kategorie: DokumentKategorie
  baustelleId: string
  onDone: () => void
}) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [datei, setDatei] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !datei) return
    setUploading(true)
    setFehler(null)

    const path = `${baustelleId}/${Date.now()}-${datei.name}`
    const { error: uploadError } = await uploadFile('dokumente', path, datei)
    if (uploadError) {
      setUploading(false)
      setFehler(`Upload fehlgeschlagen: ${uploadError.message}`)
      return
    }

    const { error } = await supabase.from('dokumente').insert({
      baustelle_id: baustelleId,
      kategorie,
      name: name.trim() || datei.name,
      datei_pfad: path,
      erstellt_von: user.id,
    })

    setUploading(false)
    if (error) {
      setFehler(error.message)
      return
    }
    onDone()
  }

  return (
    <form onSubmit={handleUpload} className="card mb-4 space-y-3 p-4">
      {fehler && <p className="banner-error">Fehler: {fehler}</p>}
      <div>
        <label className="field-label">Bezeichnung</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kategorie === 'projekt' ? 'z. B. Baustellenordnung' : 'z. B. Schaltplan EG, Kabelschema Verteiler 3'}
          className="field-input"
        />
      </div>
      <div>
        <label className="field-label">Datei</label>
        <input
          required
          type="file"
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDatei(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-text-muted"
        />
      </div>
      <button type="submit" disabled={uploading || !datei} className="btn-primary">
        {uploading ? 'Lädt hoch…' : 'Dokument speichern'}
      </button>
    </form>
  )
}

export function Dokumente() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const kannLoeschen = role === 'admin' || role === 'planer'
  const { nameOf } = useProfiles()
  const [dokumente, setDokumente] = useState<Dokument[]>([])
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [loading, setLoading] = useState(true)
  const [formOffen, setFormOffen] = useState<DokumentKategorie | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const [{ data }, { data: maengelData }] = await Promise.all([
      supabase.from('dokumente').select('*').eq('baustelle_id', baustelleId).order('erstellt_am', { ascending: false }),
      supabase.from('maengel').select('*').eq('baustelle_id', baustelleId).order('titel'),
    ])
    setDokumente(data ?? [])
    setMaengel(maengelData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelleId])

  const handleOeffnen = async (d: Dokument) => {
    const { url, error } = await getSignedUrl('dokumente', d.datei_pfad)
    if (url) window.open(url, '_blank', 'noreferrer')
    else if (error) setFehler(error)
  }

  const handleDelete = async (d: Dokument) => {
    if (!window.confirm(`"${d.name}" wirklich löschen?`)) return
    setFehler(null)
    const { error } = await supabase.from('dokumente').delete().eq('id', d.id)
    if (error) {
      setFehler(error.message)
      return
    }
    await supabase.storage.from('dokumente').remove([d.datei_pfad])
    load()
  }

  const projektdokumente = dokumente.filter((d) => d.kategorie === 'projekt')
  const aufgabendokumente = dokumente.filter((d) => d.kategorie === 'aufgabe')

  const DokumentZeile = ({ d }: { d: Dokument }) => {
    const aufgabe = d.mangel_id ? maengel.find((m) => m.id === d.mangel_id) : undefined
    return (
      <li className="card flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-muted">
          <FileText className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text">{d.name}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-subtle">
            <span className="truncate">
              {nameOf(d.erstellt_von)} · {formatDatum(d.erstellt_am)}
            </span>
            {d.kategorie === 'aufgabe' && (
              <span
                className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                  aufgabe ? 'bg-brand-soft text-brand-text' : 'bg-surface-hover text-text-subtle'
                }`}
              >
                {aufgabe ? aufgabe.titel : 'Nicht zugeordnet'}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => handleOeffnen(d)}
          aria-label="Öffnen"
          className="flex-shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-brand"
        >
          <Download className="h-4 w-4" strokeWidth={2.25} />
        </button>
        {kannLoeschen && (
          <button
            onClick={() => handleDelete(d)}
            aria-label="Löschen"
            className="flex-shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-red-600 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2.25} />
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="page">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-text">Dokumente</h1>
        <p className="text-xs text-text-muted">Schaltpläne, Kabelschema und weitere Referenzdateien.</p>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      <div className="space-y-6">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-text">
              <FolderOpen className="h-4 w-4" strokeWidth={2.25} />
              Projektdokumente
            </h2>
            {kannBearbeiten && (
              <button
                onClick={() => setFormOffen((v) => (v === 'projekt' ? null : 'projekt'))}
                className="text-xs font-medium text-brand"
              >
                {formOffen === 'projekt' ? 'Abbrechen' : '+ Projektdokument'}
              </button>
            )}
          </div>
          {formOffen === 'projekt' && baustelleId && (
            <UploadForm
              kategorie="projekt"
              baustelleId={baustelleId}
              onDone={() => {
                setFormOffen(null)
                load()
              }}
            />
          )}
          {!loading &&
            (projektdokumente.length === 0 ? (
              <p className="text-xs text-text-subtle">Keine allgemeinen Projektdokumente.</p>
            ) : (
              <ul className="space-y-2">
                {projektdokumente.map((d) => (
                  <DokumentZeile key={d.id} d={d} />
                ))}
              </ul>
            ))}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-text">
              <FileText className="h-4 w-4" strokeWidth={2.25} />
              Aufgabendokumente
            </h2>
            {kannBearbeiten && (
              <button
                onClick={() => setFormOffen((v) => (v === 'aufgabe' ? null : 'aufgabe'))}
                className="text-xs font-medium text-brand"
              >
                {formOffen === 'aufgabe' ? 'Abbrechen' : '+ Aufgabendokument'}
              </button>
            )}
          </div>
          <p className="mb-2 text-xs text-text-subtle">
            Hochgeladene Aufgabendokumente werden direkt an der Markierung bzw. Aufgabe zugeordnet.
          </p>
          {formOffen === 'aufgabe' && baustelleId && (
            <UploadForm
              kategorie="aufgabe"
              baustelleId={baustelleId}
              onDone={() => {
                setFormOffen(null)
                load()
              }}
            />
          )}
          {!loading &&
            (aufgabendokumente.length === 0 ? (
              <p className="text-xs text-text-subtle">Noch keine Aufgabendokumente hochgeladen.</p>
            ) : (
              <ul className="space-y-2">
                {aufgabendokumente.map((d) => (
                  <DokumentZeile key={d.id} d={d} />
                ))}
              </ul>
            ))}
        </div>
      </div>

      {loading && <p className="text-sm text-text-muted">Lädt…</p>}
      {!loading && dokumente.length > 0 && (
        <p className="mt-6 text-xs text-text-subtle">
          Zuordnung ändern: bei der jeweiligen{' '}
          <Link to={`/baustellen/${baustelleId}/maengel`} className="text-brand hover:underline">
            Aufgabe
          </Link>{' '}
          oder Markierung auf dem Plan unter „Fortschritt & Kommentare".
        </p>
      )}
    </div>
  )
}
