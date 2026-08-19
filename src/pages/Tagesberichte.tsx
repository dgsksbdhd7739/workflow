import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { jsPDF } from 'jspdf'
import { useParams } from 'react-router-dom'
import { CalendarDays, CloudSun, Loader2, Search, Trash2, X } from 'lucide-react'
import { supabase, getSignedUrl } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { SignedImage } from '../components/SignedImage'
import { PdfViewerModal } from '../components/PdfViewerModal'
import { erzeugeEinzelnenTagesberichtPdf, exportTagesberichtePdf, pdfSpeichernOderTeilen } from '../lib/pdf'
import { formatDatum } from '../lib/datum'
import { holeWetterFuerBaustelle, projektOrt } from '../lib/wetter'
import { standVonMangel } from '../lib/mangelStand'
import { tagesberichtName, tagesberichtNummern } from '../lib/tagesberichtName'
import type {
  Baustelle,
  Mangel,
  MangelKommentar,
  MangelMaterial,
  StatusVorlageWert,
  Tagesbericht,
  TagesberichtTuer,
  Zeiterfassung,
} from '../types/database'

const heute = () => new Date().toISOString().slice(0, 10)

function minutenVonZeit(zeit: string) {
  const [h, m] = zeit.split(':').map(Number)
  return h * 60 + m
}

function formatDauer(minuten: number) {
  const h = Math.floor(minuten / 60)
  const m = minuten % 60
  return `${h}h ${m}min`
}

function eintragMinuten(z: Zeiterfassung) {
  if (!z.end_zeit) return 0
  return Math.max(0, minutenVonZeit(z.end_zeit) - minutenVonZeit(z.start_zeit) - z.pause_minuten)
}

// Aggregiert den Tueren-Snapshot eines Berichts nach Stand statt jede Tuer
// einzeln aufzulisten -- die vollstaendige Liste gehoert nur ins PDF-Dokument.
function standZaehlung(tueren: TagesberichtTuer[]): Map<string, number> {
  const zaehlung = new Map<string, number>()
  for (const t of tueren) zaehlung.set(t.stand, (zaehlung.get(t.stand) ?? 0) + 1)
  return zaehlung
}

// Vor der Aenderung an handleAutoErstellen enthalten bereits gespeicherte
// Berichte noch den vollstaendigen "Noch offen"-Dump im Freitext. Wird beim
// Anzeigen herausgefiltert, ohne die gespeicherten Daten zu veraendern.
function taetigkeitenAnzeige(text: string): string {
  return text.replace(/\n*Noch offen:\n(?:- .+\n?)+/, '').trim()
}

export function Tagesberichte() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user, role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const kannLoeschen = role === 'admin' || role === 'planer'
  const { nameOf } = useProfiles()
  const [baustelle, setBaustelle] = useState<Baustelle | null>(null)
  const [berichte, setBerichte] = useState<Tagesbericht[]>([])
  const [zeiten, setZeiten] = useState<Zeiterfassung[]>([])
  const [maengel, setMaengel] = useState<Mangel[]>([])
  const [material, setMaterial] = useState<MangelMaterial[]>([])
  const [kommentare, setKommentare] = useState<MangelKommentar[]>([])
  const [tueren, setTueren] = useState<TagesberichtTuer[]>([])
  const [werteMap, setWerteMap] = useState<Record<string, StatusVorlageWert>>({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [pdfExportiert, setPdfExportiert] = useState(false)
  const [oeffnendId, setOeffnendId] = useState<string | null>(null)
  const [pdfViewer, setPdfViewer] = useState<{ data: ArrayBuffer; doc: jsPDF; dateiname: string } | null>(null)
  const [loeschendId, setLoeschendId] = useState<string | null>(null)
  const [exportAuswahlOffen, setExportAuswahlOffen] = useState(false)
  const [exportAusgewaehlt, setExportAusgewaehlt] = useState<Set<string>>(new Set())
  const [wetterLaedt, setWetterLaedt] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [suche, setSuche] = useState('')
  const [datumsFilter, setDatumsFilter] = useState('')

  const [datum, setDatum] = useState(heute())
  const [wetter, setWetter] = useState('')
  const [temperatur, setTemperatur] = useState('')
  const [personalAnzahl, setPersonalAnzahl] = useState('')
  const [taetigkeiten, setTaetigkeiten] = useState('')
  const [besonderheiten, setBesonderheiten] = useState('')

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const [{ data }, { data: baustelleData }, { data: zeitenData }, { data: maengelData }, { data: werteData }] =
      await Promise.all([
        supabase.from('tagesberichte').select('*').eq('baustelle_id', baustelleId).order('datum', { ascending: false }),
        supabase.from('baustellen').select('*').eq('id', baustelleId).single(),
        supabase.from('zeiterfassung').select('*').eq('baustelle_id', baustelleId).order('start_zeit'),
        supabase.from('maengel').select('*').eq('baustelle_id', baustelleId),
        supabase.from('statusvorlage_werte').select('*'),
      ])
    setBerichte(data ?? [])
    setBaustelle(baustelleData)
    setZeiten(zeitenData ?? [])
    setMaengel(maengelData ?? [])
    const wMap: Record<string, StatusVorlageWert> = {}
    for (const w of werteData ?? []) wMap[w.id] = w
    setWerteMap(wMap)

    const mangelIds = (maengelData ?? []).map((m) => m.id)
    if (mangelIds.length > 0) {
      const [{ data: materialData }, { data: kommentareData }] = await Promise.all([
        supabase.from('mangel_material').select('*').in('mangel_id', mangelIds),
        supabase.from('mangel_kommentare').select('*').in('mangel_id', mangelIds),
      ])
      setMaterial(materialData ?? [])
      setKommentare(kommentareData ?? [])
    } else {
      setMaterial([])
      setKommentare([])
    }

    const berichtIds = (data ?? []).map((b) => b.id)
    if (berichtIds.length > 0) {
      const { data: tuerenData } = await supabase
        .from('tagesbericht_tueren')
        .select('*')
        .in('tagesbericht_id', berichtIds)
        .order('reihenfolge')
      setTueren(tuerenData ?? [])
    } else {
      setTueren([])
    }

    setLoading(false)
  }

  const tuerenSnapshotEinfuegen = async (tagesberichtId: string) => {
    if (maengel.length === 0) return
    const zeilen = maengel.map((m, i) => ({
      tagesbericht_id: tagesberichtId,
      mangel_id: m.id,
      titel: m.titel,
      stand: standVonMangel(m, werteMap),
      reihenfolge: i,
    }))
    await supabase.from('tagesbericht_tueren').insert(zeilen)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelleId])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || !baustelleId) return
    setSaving(true)
    setFehler(null)
    const { data: neuerBericht, error } = await supabase
      .from('tagesberichte')
      .insert({
        baustelle_id: baustelleId,
        datum,
        wetter: wetter || null,
        temperatur: temperatur ? Number(temperatur) : null,
        personal_anzahl: personalAnzahl ? Number(personalAnzahl) : null,
        taetigkeiten: taetigkeiten || null,
        besonderheiten: besonderheiten || null,
        erstellt_von: user.id,
      })
      .select()
      .single()
    setSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    if (neuerBericht) await tuerenSnapshotEinfuegen(neuerBericht.id)
    setDatum(heute())
    setWetter('')
    setTemperatur('')
    setPersonalAnzahl('')
    setTaetigkeiten('')
    setBesonderheiten('')
    setShowForm(false)
    load()
  }

  const handleAutoErstellen = async () => {
    if (!user || !baustelleId) return
    setAutoSaving(true)
    setFehler(null)

    const heuteDatum = heute()
    const zeitenHeute = zeiten.filter((z) => z.datum === heuteDatum)

    const nachAufgabe = new Map<string, Zeiterfassung[]>()
    for (const z of zeitenHeute) {
      if (!z.mangel_id) continue
      const liste = nachAufgabe.get(z.mangel_id) ?? []
      liste.push(z)
      nachAufgabe.set(z.mangel_id, liste)
    }

    const erledigtZeilen: string[] = []
    for (const [mangelId, eintraege] of nachAufgabe) {
      const m = maengel.find((x) => x.id === mangelId)
      if (!m || m.status !== 'erledigt') continue
      const technikerNamen = [...new Set(eintraege.map((e) => nameOf(e.user_id)))].join(', ')
      const minuten = eintraege.reduce((sum, e) => sum + eintragMinuten(e), 0)
      erledigtZeilen.push(`- ${m.titel} (${technikerNamen}, ${formatDauer(minuten)})`)
    }

    // Der Stand aller offenen Aufgaben wird bereits als Tueren-Snapshot
    // (tuerenSnapshotEinfuegen) je Bericht gespeichert und dort aggregiert
    // nach Fortschrittsstufe angezeigt -- ihn hier zusaetzlich Zeile fuer
    // Zeile in den Freitext zu dumpen, machte die Karte unlesbar.
    const text = erledigtZeilen.length > 0 ? `Heute erledigt:\n${erledigtZeilen.join('\n')}` : 'Keine Aktivität erfasst.'

    const technikerAnzahl = new Set(zeitenHeute.map((z) => z.user_id)).size

    const { data: neuerBericht, error } = await supabase
      .from('tagesberichte')
      .insert({
        baustelle_id: baustelleId,
        datum: heuteDatum,
        personal_anzahl: technikerAnzahl || null,
        taetigkeiten: text,
        erstellt_von: user.id,
      })
      .select()
      .single()
    setAutoSaving(false)
    if (error) {
      setFehler(
        /duplicate key|unique/i.test(error.message)
          ? 'Du hast heute für dieses Projekt bereits einen Tagesbericht erstellt.'
          : error.message,
      )
      return
    }
    if (neuerBericht) await tuerenSnapshotEinfuegen(neuerBericht.id)
    load()
  }

  const handleWetterAbrufen = async () => {
    if (!baustelle || !datum) return
    setWetterLaedt(true)
    setFehler(null)
    const ergebnis = await holeWetterFuerBaustelle(baustelle, datum)
    setWetterLaedt(false)
    if (!ergebnis) {
      setFehler('Wetter konnte nicht ermittelt werden. Bitte manuell eintragen.')
      return
    }
    setWetter(ergebnis.wetter)
    setTemperatur(String(ergebnis.temperatur))
  }

  const handleExport = async () => {
    if (!baustelle) return
    const ausgewaehlteBerichte = berichte.filter((b) => exportAusgewaehlt.has(b.id))
    if (ausgewaehlteBerichte.length === 0) return
    setPdfExportiert(true)
    try {
      await exportTagesberichtePdf(baustelle, ausgewaehlteBerichte, zeiten, maengel, material, kommentare, tueren, werteMap, nameOf)
      setExportAuswahlOffen(false)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'PDF-Export fehlgeschlagen.')
    }
    setPdfExportiert(false)
  }

  const toggleExportAuswahl = (id: string) => {
    setExportAusgewaehlt((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const nummern = useMemo(() => tagesberichtNummern(berichte), [berichte])

  const handleOeffnen = async (b: Tagesbericht) => {
    if (!baustelle) return
    setOeffnendId(b.id)
    setFehler(null)
    try {
      const dateiname = tagesberichtName(baustelle, b, nummern[b.id])
      const doc = await erzeugeEinzelnenTagesberichtPdf(
        baustelle,
        b,
        zeiten,
        maengel,
        material,
        kommentare,
        tueren,
        werteMap,
        nameOf,
        dateiname,
      )
      setPdfViewer({ data: doc.output('arraybuffer'), doc, dateiname: `${dateiname}.pdf` })
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'PDF konnte nicht geöffnet werden.')
    }
    setOeffnendId(null)
  }

  const handleDelete = async (b: Tagesbericht) => {
    if (!window.confirm('Tagesbericht wirklich endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return
    setLoeschendId(b.id)
    setFehler(null)
    const { error } = await supabase.from('tagesberichte').delete().eq('id', b.id)
    setLoeschendId(null)
    if (error) {
      setFehler(error.message)
      return
    }
    setBerichte((prev) => prev.filter((x) => x.id !== b.id))
  }

  const gefilterteBerichte = useMemo(() => {
    return berichte.filter((b) => {
      if (datumsFilter && b.datum !== datumsFilter) return false
      if (suche.trim()) {
        const q = suche.trim().toLowerCase()
        const name = tagesberichtName(baustelle ?? ({ name: '' } as Baustelle), b, nummern[b.id]).toLowerCase()
        const treffer =
          name.includes(q) ||
          formatDatum(b.datum).toLowerCase().includes(q) ||
          (b.taetigkeiten ?? '').toLowerCase().includes(q) ||
          (b.besonderheiten ?? '').toLowerCase().includes(q)
        if (!treffer) return false
      }
      return true
    })
  }, [berichte, datumsFilter, suche, baustelle, nummern])

  return (
    <>
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Bautagebuch</h1>
        <div className="flex gap-2">
          {baustelle && berichte.length > 0 && (
            <button
              onClick={() => {
                setExportAusgewaehlt(new Set(berichte.map((b) => b.id)))
                setExportAuswahlOffen((v) => !v)
              }}
              className="btn-secondary"
            >
              PDF exportieren
            </button>
          )}
          {kannBearbeiten && (
            <button onClick={handleAutoErstellen} disabled={autoSaving} className="btn-primary">
              {autoSaving ? 'Erstellt…' : '📋 Bericht für heute erstellen'}
            </button>
          )}
          {kannBearbeiten && (
            <button onClick={() => setShowForm((v) => !v)} className="btn-secondary">
              {showForm ? 'Abbrechen' : '+ Manuell'}
            </button>
          )}
        </div>
      </div>

      {exportAuswahlOffen && baustelle && (
        <div className="card mb-4 space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-text">Tagesberichte für den Export auswählen</p>
            <button
              type="button"
              onClick={() =>
                setExportAusgewaehlt((prev) =>
                  prev.size === berichte.length ? new Set() : new Set(berichte.map((b) => b.id)),
                )
              }
              className="flex-shrink-0 text-xs text-brand hover:underline"
            >
              {exportAusgewaehlt.size === berichte.length ? 'Alle abwählen' : 'Alle auswählen'}
            </button>
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {berichte.map((b) => (
              <li key={b.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={exportAusgewaehlt.has(b.id)}
                    onChange={() => toggleExportAuswahl(b.id)}
                    className="h-4 w-4 flex-shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate text-text">{tagesberichtName(baustelle, b, nummern[b.id])}</span>
                  <span className="flex-shrink-0 text-xs text-text-subtle">{formatDatum(b.datum)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={pdfExportiert || exportAusgewaehlt.size === 0} className="btn-primary">
              {pdfExportiert
                ? 'Exportiert…'
                : `${exportAusgewaehlt.size} Bericht${exportAusgewaehlt.size === 1 ? '' : 'e'} exportieren`}
            </button>
            <button onClick={() => setExportAuswahlOffen(false)} className="btn-secondary">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {!loading && berichte.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" strokeWidth={2.25} />
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Suche nach Name, Datum, Inhalt…"
              className="field-input w-full pl-8"
            />
          </div>
          <div className="relative flex-shrink-0">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" strokeWidth={2.25} />
            <input
              type="date"
              value={datumsFilter}
              onChange={(e) => setDatumsFilter(e.target.value)}
              className="field-input pl-8"
            />
          </div>
          {(suche || datumsFilter) && (
            <button
              type="button"
              onClick={() => {
                setSuche('')
                setDatumsFilter('')
              }}
              aria-label="Filter zurücksetzen"
              className="flex-shrink-0 rounded-lg p-2 text-text-subtle hover:bg-surface-hover hover:text-text"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Datum</label>
              <input
                type="date"
                required
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Personal (Anzahl)</label>
              <input
                type="number"
                min={0}
                value={personalAnzahl}
                onChange={(e) => setPersonalAnzahl(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-1">
                <label className="field-label mb-0">Wetter</label>
                {baustelle && projektOrt(baustelle) && (
                  <button
                    type="button"
                    onClick={handleWetterAbrufen}
                    disabled={wetterLaedt || !datum}
                    className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-brand disabled:opacity-50"
                  >
                    {wetterLaedt ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                    ) : (
                      <CloudSun className="h-3.5 w-3.5" strokeWidth={2.25} />
                    )}
                    Abrufen
                  </button>
                )}
              </div>
              <input
                value={wetter}
                onChange={(e) => setWetter(e.target.value)}
                placeholder="z. B. sonnig, 18°C"
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Temperatur (°C)</label>
              <input
                type="number"
                value={temperatur}
                onChange={(e) => setTemperatur(e.target.value)}
                className="field-input"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Tätigkeiten</label>
            <textarea
              value={taetigkeiten}
              onChange={(e) => setTaetigkeiten(e.target.value)}
              rows={3}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Besonderheiten</label>
            <textarea
              value={besonderheiten}
              onChange={(e) => setBesonderheiten(e.target.value)}
              rows={2}
              className="field-input"
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Speichert…' : 'Tagesbericht speichern'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : berichte.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Tagesberichte.</p>
      ) : gefilterteBerichte.length === 0 ? (
        <p className="text-sm text-text-muted">Keine Tagesberichte gefunden.</p>
      ) : (
        <ul className="space-y-3">
          {gefilterteBerichte.map((b) => {
            const tagesZeiten = zeiten.filter((z) => z.datum === b.datum)
            const tagesMinuten = tagesZeiten.reduce((acc, z) => acc + eintragMinuten(z), 0)
            const tuerenDesBerichts = tueren.filter((t) => t.tagesbericht_id === b.id)
            return (
            <li key={b.id} className="card p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleOeffnen(b)}
                  disabled={oeffnendId === b.id}
                  className="min-w-0 truncate text-left font-medium text-brand hover:underline disabled:opacity-60"
                  title="Als PDF öffnen"
                >
                  {oeffnendId === b.id
                    ? 'Öffnet…'
                    : baustelle
                      ? tagesberichtName(baustelle, b, nummern[b.id])
                      : formatDatum(b.datum)}
                </button>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="text-xs text-text-subtle">{nameOf(b.erstellt_von)}</span>
                  {kannLoeschen && (
                    <button
                      type="button"
                      onClick={() => handleDelete(b)}
                      disabled={loeschendId === b.id}
                      aria-label="Tagesbericht löschen"
                      title="Tagesbericht löschen"
                      className="text-text-subtle hover:text-red-600 disabled:opacity-60 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  )}
                </div>
              </div>
              <div className="mb-1 text-xs text-text-subtle">{formatDatum(b.datum)}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                {b.wetter && <span>Wetter: {b.wetter}</span>}
                {b.temperatur !== null && <span>{b.temperatur}°C</span>}
                {b.personal_anzahl !== null && <span>Personal: {b.personal_anzahl}</span>}
              </div>
              {b.taetigkeiten && taetigkeitenAnzeige(b.taetigkeiten) && (
                <p className="mt-2 text-sm text-text-muted">{taetigkeitenAnzeige(b.taetigkeiten)}</p>
              )}
              {b.besonderheiten && (
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">⚠ {b.besonderheiten}</p>
              )}
              {tuerenDesBerichts.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <span className="text-xs font-medium text-text">Fortschritt ({tuerenDesBerichts.length})</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {[...standZaehlung(tuerenDesBerichts).entries()].map(([stand, anzahl]) => (
                      <span
                        key={stand}
                        className="flex-shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-text"
                      >
                        {stand}: {anzahl} ({Math.round((anzahl / tuerenDesBerichts.length) * 100)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {tagesZeiten.length > 0 && (
                <div className="mt-3 border-t border-border pt-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-text">Zeiterfassung</span>
                    <span className="text-xs text-text-subtle">Gesamt: {formatDauer(tagesMinuten)}</span>
                  </div>
                  <ul className="space-y-1">
                    {tagesZeiten.map((z) => (
                      <li key={z.id} className="flex items-center justify-between gap-2 text-xs text-text-muted">
                        <span className="min-w-0 truncate">
                          {nameOf(z.user_id)} —{' '}
                          {z.mangel_id ? (maengel.find((m) => m.id === z.mangel_id)?.titel ?? 'Aufgabe') : 'Allgemein'}
                        </span>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          {z.foto_pfad && (
                            <button
                              type="button"
                              title="Foto vom IST-Stand"
                              onClick={async () => {
                                const { url } = await getSignedUrl('mangel-fotos', z.foto_pfad!)
                                if (url) window.open(url, '_blank', 'noreferrer')
                              }}
                            >
                              <SignedImage
                                bucket="mangel-fotos"
                                path={z.foto_pfad}
                                alt="IST-Stand"
                                className="h-8 w-8 rounded object-cover"
                              />
                            </button>
                          )}
                          <span className="text-text-subtle">
                            {z.end_zeit ? formatDauer(eintragMinuten(z)) : 'läuft noch'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
            )
          })}
        </ul>
      )}
    </div>
    {pdfViewer && (
      <PdfViewerModal
        data={pdfViewer.data}
        titel={pdfViewer.dateiname}
        onClose={() => setPdfViewer(null)}
        onTeilen={() => pdfSpeichernOderTeilen(pdfViewer.doc, pdfViewer.dateiname)}
      />
    )}
    </>
  )
}
