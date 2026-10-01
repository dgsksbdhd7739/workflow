import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Download, FileText, Folder, FolderOpen, Trash2 } from 'lucide-react'
import { supabase, getSignedUrl, uploadFile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { formatDatum } from '../lib/datum'
import type { Dokument, DokumentKategorie, DokumentOrdner, Aufgabe } from '../types/database'

function formatGroesse(bytes: number | null): string | null {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const freigabeLabel: Record<Dokument['freigabestatus'], string> = {
  keine_anforderung: 'Keine Freigabe angefordert',
  angefordert: 'Freigabe angefordert',
  freigegeben: 'Freigegeben',
  abgelehnt: 'Abgelehnt',
}

const freigabeFarbe: Record<Dokument['freigabestatus'], string> = {
  keine_anforderung: 'bg-surface-hover text-text-subtle',
  angefordert: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  freigegeben: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  abgelehnt: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
}

function UploadForm({
  kategorie,
  projektId,
  ordnerId,
  vorgaenger,
  onDone,
}: {
  kategorie: DokumentKategorie
  projektId: string
  ordnerId?: string | null
  vorgaenger?: Dokument
  onDone: () => void
}) {
  const { user } = useAuth()
  const [name, setName] = useState(vorgaenger?.name ?? '')
  const [datei, setDatei] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !datei) return
    setUploading(true)
    setFehler(null)

    const { path, error: uploadError } = await uploadFile('dokumente', projektId, datei)
    if (uploadError) {
      setUploading(false)
      setFehler(`Upload fehlgeschlagen: ${uploadError}`)
      return
    }

    const { error } = await supabase.from('dokumente').insert({
      projekt_id: projektId,
      aufgabe_id: vorgaenger?.aufgabe_id ?? null,
      kategorie,
      name: name.trim() || datei.name,
      datei_pfad: path,
      erstellt_von: user.id,
      vorgaenger_id: vorgaenger?.id ?? null,
      ordner_id: vorgaenger?.ordner_id ?? ordnerId ?? null,
      groesse_bytes: datei.size,
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
          placeholder={kategorie === 'projekt' ? 'z. B. Projektordnung' : 'z. B. Schaltplan EG, Kabelschema Verteiler 3'}
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
        {uploading ? 'Lädt hoch…' : vorgaenger ? 'Neue Version speichern' : 'Dokument speichern'}
      </button>
    </form>
  )
}

export function Dokumente() {
  const { id: projektId } = useParams<{ id: string }>()
  const { user, role, gesperrteModule } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const kannLoeschen = role === 'admin' || role === 'planer'
  const kannEntscheiden = role === 'admin' || role === 'planer'
  const { nameOf } = useProfiles()
  const [dokumente, setDokumente] = useState<Dokument[]>([])
  const [ordner, setOrdner] = useState<DokumentOrdner[]>([])
  const [aktuellerOrdnerId, setAktuellerOrdnerId] = useState<string | null>(null)
  const [ordnerFormOffen, setOrdnerFormOffen] = useState(false)
  const [neuerOrdnerName, setNeuerOrdnerName] = useState('')
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [loading, setLoading] = useState(true)
  const [formOffen, setFormOffen] = useState<DokumentKategorie | null>(null)
  const [neueVersionFuer, setNeueVersionFuer] = useState<Dokument | null>(null)
  const [versionenOffenFuer, setVersionenOffenFuer] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const load = async () => {
    if (!projektId) return
    setLoading(true)
    const [{ data }, { data: aufgabenData }, { data: ordnerData }] = await Promise.all([
      supabase.from('dokumente').select('*').eq('projekt_id', projektId).order('erstellt_am', { ascending: false }),
      supabase.from('aufgaben').select('*').eq('projekt_id', projektId).order('titel'),
      supabase.from('dokument_ordner').select('*').eq('projekt_id', projektId).order('name'),
    ])
    setDokumente(data ?? [])
    setAufgaben(aufgabenData ?? [])
    setOrdner(ordnerData ?? [])
    setLoading(false)
  }

  const ordnerAnlegen = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !projektId || !neuerOrdnerName.trim()) return
    setFehler(null)
    const { error } = await supabase.from('dokument_ordner').insert({
      projekt_id: projektId,
      parent_id: aktuellerOrdnerId,
      name: neuerOrdnerName.trim(),
      erstellt_von: user.id,
    })
    if (error) {
      setFehler(error.message)
      return
    }
    setNeuerOrdnerName('')
    setOrdnerFormOffen(false)
    load()
  }

  const ordnerLoeschen = async (o: DokumentOrdner) => {
    if (!window.confirm(`Ordner "${o.name}" wirklich löschen? Enthaltene Unterordner werden mitgelöscht, Dokumente bleiben erhalten und wandern in den übergeordneten Ordner.`)) return
    setFehler(null)
    const { error } = await supabase.from('dokument_ordner').delete().eq('id', o.id)
    if (error) {
      setFehler(error.message)
      return
    }
    load()
  }

  // Breadcrumb-Pfad vom aktuellen Ordner zur Wurzel zurueckverfolgen.
  const ordnerPfad: DokumentOrdner[] = []
  {
    let id = aktuellerOrdnerId
    while (id) {
      const o = ordner.find((x) => x.id === id)
      if (!o) break
      ordnerPfad.unshift(o)
      id = o.parent_id
    }
  }
  const unterordner = ordner.filter((o) => o.parent_id === aktuellerOrdnerId)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projektId])

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

  const anfordernFreigabe = async (d: Dokument) => {
    if (!user) return
    setFehler(null)
    const { error: freigabeError } = await supabase
      .from('dokument_freigaben')
      .insert({ dokument_id: d.id, status: 'angefordert', angefordert_von: user.id })
    if (freigabeError) {
      setFehler(freigabeError.message)
      return
    }
    const { error } = await supabase.from('dokumente').update({ freigabestatus: 'angefordert' }).eq('id', d.id)
    if (error) setFehler(error.message)
    load()
  }

  const entscheideFreigabe = async (d: Dokument, status: 'freigegeben' | 'abgelehnt') => {
    if (!user) return
    setFehler(null)
    const { data: offeneAnforderung } = await supabase
      .from('dokument_freigaben')
      .select('id')
      .eq('dokument_id', d.id)
      .eq('status', 'angefordert')
      .order('angefordert_am', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (offeneAnforderung) {
      await supabase
        .from('dokument_freigaben')
        .update({ status, entschieden_von: user.id, entschieden_am: new Date().toISOString() })
        .eq('id', offeneAnforderung.id)
    }
    const { error } = await supabase.from('dokumente').update({ freigabestatus: status }).eq('id', d.id)
    if (error) setFehler(error.message)
    load()
  }

  // Nur die jeweils neueste Version einer Kette in der Hauptliste zeigen --
  // aeltere Versionen bleiben erhalten, sind aber nur ueber "Versionen
  // anzeigen" bei der neuesten Version sichtbar.
  const vorgaengerIds = new Set(dokumente.map((d) => d.vorgaenger_id).filter((id): id is string => id != null))
  const aktuelleDokumente = dokumente.filter((d) => !vorgaengerIds.has(d.id))
  const vorherigeVersionen = (d: Dokument): Dokument[] => {
    const kette: Dokument[] = []
    let aktuellesVorgaengerId = d.vorgaenger_id
    while (aktuellesVorgaengerId) {
      const vorgaenger = dokumente.find((x) => x.id === aktuellesVorgaengerId)
      if (!vorgaenger) break
      kette.push(vorgaenger)
      aktuellesVorgaengerId = vorgaenger.vorgaenger_id
    }
    return kette
  }

  const projektdokumente = aktuelleDokumente.filter((d) => d.kategorie === 'projekt' && d.ordner_id === aktuellerOrdnerId)
  const aufgabendokumente = aktuelleDokumente.filter((d) => d.kategorie === 'aufgabe')

  const DokumentZeile = ({ d }: { d: Dokument }) => {
    const aufgabe = d.aufgabe_id ? aufgaben.find((m) => m.id === d.aufgabe_id) : undefined
    const aeltereVersionen = vorherigeVersionen(d)
    return (
      <li className="card p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-hover text-text-muted">
            <FileText className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text">{d.name}</div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-subtle">
              <span className="truncate">
                {nameOf(d.erstellt_von)} · {formatDatum(d.erstellt_am)}
                {formatGroesse(d.groesse_bytes) && <> · {formatGroesse(d.groesse_bytes)}</>}
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
              <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${freigabeFarbe[d.freigabestatus]}`}>
                {freigabeLabel[d.freigabestatus]}
              </span>
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
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 pl-12 text-xs">
          {kannBearbeiten && (d.freigabestatus === 'keine_anforderung' || d.freigabestatus === 'abgelehnt') && (
            <button onClick={() => anfordernFreigabe(d)} className="font-medium text-brand">
              Freigabe anfordern
            </button>
          )}
          {kannEntscheiden && d.freigabestatus === 'angefordert' && (
            <>
              <button onClick={() => entscheideFreigabe(d, 'freigegeben')} className="font-medium text-emerald-600 dark:text-emerald-400">
                Freigeben
              </button>
              <button onClick={() => entscheideFreigabe(d, 'abgelehnt')} className="font-medium text-red-600 dark:text-red-400">
                Ablehnen
              </button>
            </>
          )}
          {kannBearbeiten && (
            <button
              onClick={() => setNeueVersionFuer((prev) => (prev?.id === d.id ? null : d))}
              className="font-medium text-text-subtle hover:text-text"
            >
              {neueVersionFuer?.id === d.id ? 'Abbrechen' : 'Neue Version hochladen'}
            </button>
          )}
          {aeltereVersionen.length > 0 && (
            <button
              onClick={() => setVersionenOffenFuer((prev) => (prev === d.id ? null : d.id))}
              className="font-medium text-text-subtle hover:text-text"
            >
              {versionenOffenFuer === d.id ? 'Versionen ausblenden' : `${aeltereVersionen.length} ältere Version${aeltereVersionen.length === 1 ? '' : 'en'}`}
            </button>
          )}
        </div>

        {neueVersionFuer?.id === d.id && projektId && (
          <div className="mt-2 pl-12">
            <UploadForm
              kategorie={d.kategorie}
              projektId={projektId}
              vorgaenger={d}
              onDone={() => {
                setNeueVersionFuer(null)
                load()
              }}
            />
          </div>
        )}

        {versionenOffenFuer === d.id && aeltereVersionen.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-border pl-12 pt-2">
            {aeltereVersionen.map((v) => (
              <li key={v.id} className="flex items-center gap-2 text-xs text-text-subtle">
                <button onClick={() => handleOeffnen(v)} className="truncate hover:text-brand hover:underline">
                  {v.name}
                </button>
                <span>· {formatDatum(v.erstellt_am)}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${freigabeFarbe[v.freigabestatus]}`}>
                  {freigabeLabel[v.freigabestatus]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  if (gesperrteModule.has('dokumente')) {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Sie haben keinen Zugang zu diesem Bereich.</p>
      </div>
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
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOrdnerFormOffen((v) => !v)}
                  className="text-xs font-medium text-brand"
                >
                  {ordnerFormOffen ? 'Abbrechen' : '+ Ordner'}
                </button>
                <button
                  onClick={() => setFormOffen((v) => (v === 'projekt' ? null : 'projekt'))}
                  className="text-xs font-medium text-brand"
                >
                  {formOffen === 'projekt' ? 'Abbrechen' : '+ Projektdokument'}
                </button>
              </div>
            )}
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-text-muted">
            <button
              onClick={() => setAktuellerOrdnerId(null)}
              className={aktuellerOrdnerId === null ? 'font-medium text-text' : 'hover:text-brand hover:underline'}
            >
              Alle Projektdokumente
            </button>
            {ordnerPfad.map((o) => (
              <span key={o.id} className="flex items-center gap-1">
                <span className="text-text-subtle">/</span>
                <button
                  onClick={() => setAktuellerOrdnerId(o.id)}
                  className={o.id === aktuellerOrdnerId ? 'font-medium text-text' : 'hover:text-brand hover:underline'}
                >
                  {o.name}
                </button>
              </span>
            ))}
          </div>

          {ordnerFormOffen && (
            <form onSubmit={ordnerAnlegen} className="mb-3 flex gap-2">
              <input
                autoFocus
                value={neuerOrdnerName}
                onChange={(e) => setNeuerOrdnerName(e.target.value)}
                placeholder="Ordnername, z. B. Schaltpläne"
                className="field-input flex-1"
              />
              <button type="submit" className="btn-primary">
                Anlegen
              </button>
            </form>
          )}

          {unterordner.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {unterordner.map((o) => (
                <li key={o.id} className="card flex items-center gap-2 p-2.5">
                  <button
                    onClick={() => setAktuellerOrdnerId(o.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Folder className="h-4 w-4 flex-shrink-0 text-brand" strokeWidth={2.25} />
                    <span className="truncate text-sm font-medium text-text">{o.name}</span>
                  </button>
                  {kannLoeschen && (
                    <button
                      onClick={() => ordnerLoeschen(o)}
                      aria-label="Ordner löschen"
                      className="flex-shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {formOffen === 'projekt' && projektId && (
            <UploadForm
              kategorie="projekt"
              projektId={projektId}
              ordnerId={aktuellerOrdnerId}
              onDone={() => {
                setFormOffen(null)
                load()
              }}
            />
          )}
          {!loading &&
            (projektdokumente.length === 0 ? (
              <p className="text-xs text-text-subtle">
                {unterordner.length > 0 ? 'Keine Dokumente direkt in diesem Ordner.' : 'Keine allgemeinen Projektdokumente.'}
              </p>
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
          {formOffen === 'aufgabe' && projektId && (
            <UploadForm
              kategorie="aufgabe"
              projektId={projektId}
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
          <Link to={`/projekte/${projektId}/aufgaben`} className="text-brand hover:underline">
            Aufgabe
          </Link>{' '}
          oder Markierung auf dem Plan unter „Fortschritt & Kommentare".
        </p>
      )}
    </div>
  )
}
