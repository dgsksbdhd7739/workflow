import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Trash2, X } from 'lucide-react'
import { supabase, getSignedUrl, uploadFile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { SignedImage } from './SignedImage'
import { komprimiereBild } from '../lib/bildKompression'
import type { Dokument, Mangel, MangelKommentar, MangelMaterial, MaterialStamm, StatusVorlageWert } from '../types/database'

// Gruen ist standardmaessig fuer "Abnahme" reserviert, deshalb hier nicht zur Auswahl.
const fortschrittFarbPalette = ['#dc2626', '#ea580c', '#f59e0b', '#eab308', '#2563eb', '#9333ea', '#d946ef', '#6b7280']

function relativZeit(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minuten = Math.floor(diffMs / 60_000)
  if (minuten < 1) return 'gerade eben'
  if (minuten < 60) return `vor ${minuten} Min.`
  const stunden = Math.floor(minuten / 60)
  if (stunden < 24) return `vor ${stunden} Std.`
  const tage = Math.floor(stunden / 24)
  return `vor ${tage} Tag${tage === 1 ? '' : 'en'}`
}

export function MangelDetails({
  mangelId,
  werte: werteProp,
  vorlageId: vorlageIdProp,
  onChange,
}: {
  mangelId: string
  werte?: StatusVorlageWert[]
  vorlageId?: string | null
  onChange?: () => void
}) {
  const { user, role, unternehmenId } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const kannMaterialDefinieren = role === 'admin' || role === 'planer'
  const kannMaterialAbhaken = role !== 'kunde'
  const kannFortschrittDefinieren = role === 'admin' || role === 'planer'
  const { nameOf } = useProfiles()
  const [mangel, setMangel] = useState<Mangel | null>(null)
  const [werteLokal, setWerteLokal] = useState<StatusVorlageWert[]>([])
  const [vorlageIdLokal, setVorlageIdLokal] = useState<string | null>(null)
  const werte = werteProp ?? werteLokal
  const vorlageId = werteProp ? (vorlageIdProp ?? null) : vorlageIdLokal
  const [kommentare, setKommentare] = useState<MangelKommentar[]>([])
  const [material, setMaterial] = useState<MangelMaterial[]>([])
  const [dokumente, setDokumente] = useState<Dokument[]>([])
  const [freieDokumente, setFreieDokumente] = useState<Dokument[]>([])
  const [loading, setLoading] = useState(true)

  const [zuordnenOffen, setZuordnenOffen] = useState(false)
  const [auswahlDokId, setAuswahlDokId] = useState('')
  const [zuordnenSaving, setZuordnenSaving] = useState(false)

  const [fortschrittFormOffen, setFortschrittFormOffen] = useState(false)
  const [neuerFortschrittTitel, setNeuerFortschrittTitel] = useState('')
  const [neuerFortschrittFarbe, setNeuerFortschrittFarbe] = useState(fortschrittFarbPalette[0])
  const [fortschrittSaving, setFortschrittSaving] = useState(false)

  const [abnahmeFormFuerWert, setAbnahmeFormFuerWert] = useState<string | null>(null)
  const [abnahmeNummerEingabe, setAbnahmeNummerEingabe] = useState('')

  const [materialFormOffen, setMaterialFormOffen] = useState(false)
  const [materialStamm, setMaterialStamm] = useState<MaterialStamm[]>([])
  const [neuesMaterialStammId, setNeuesMaterialStammId] = useState('')
  const [neuesMaterialMenge, setNeuesMaterialMenge] = useState('1')
  const [materialSaving, setMaterialSaving] = useState(false)

  const [kommentarText, setKommentarText] = useState('')
  const [kommentarFoto, setKommentarFoto] = useState<File | null>(null)
  const [kommentarSaving, setKommentarSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const [{ data: mangelData }, { data: kommentareData }, { data: materialData }, { data: dokumenteData }] = await Promise.all([
      supabase.from('maengel').select('*').eq('id', mangelId).single(),
      supabase.from('mangel_kommentare').select('*').eq('mangel_id', mangelId).order('erstellt_am'),
      supabase.from('mangel_material').select('*').eq('mangel_id', mangelId).order('reihenfolge'),
      supabase.from('dokumente').select('*').eq('mangel_id', mangelId).order('erstellt_am', { ascending: false }),
    ])
    setMangel(mangelData)
    setKommentare(kommentareData ?? [])
    setMaterial(materialData ?? [])
    setDokumente(dokumenteData ?? [])

    if (mangelData?.baustelle_id) {
      const { data: freieDokumenteData } = await supabase
        .from('dokumente')
        .select('*')
        .eq('baustelle_id', mangelData.baustelle_id)
        .eq('kategorie', 'aufgabe')
        .is('mangel_id', null)
        .order('erstellt_am', { ascending: false })
      setFreieDokumente(freieDokumenteData ?? [])
    }

    if (!werteProp) {
      let ermitteltId: string | null = null
      if (mangelData?.plan_id) {
        const { data: planData } = await supabase
          .from('plaene')
          .select('statusvorlage_id')
          .eq('id', mangelData.plan_id)
          .single()
        ermitteltId = planData?.statusvorlage_id ?? null
      }
      if (!ermitteltId) {
        const { data: standardVorlage } = await supabase
          .from('statusvorlagen')
          .select('id')
          .eq('ist_standard', true)
          .limit(1)
          .maybeSingle()
        ermitteltId = standardVorlage?.id ?? null
      }
      setVorlageIdLokal(ermitteltId)
      if (ermitteltId) {
        const { data: werteData } = await supabase
          .from('statusvorlage_werte')
          .select('*')
          .eq('statusvorlage_id', ermitteltId)
          .order('reihenfolge')
        setWerteLokal(werteData ?? [])
      } else {
        setWerteLokal([])
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangelId])

  useEffect(() => {
    if (!kannMaterialDefinieren || !unternehmenId) return
    supabase
      .from('material_stamm')
      .select('*')
      .eq('unternehmen_id', unternehmenId)
      .order('bezeichnung')
      .then(({ data }) => setMaterialStamm(data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kannMaterialDefinieren, unternehmenId])

  const waehleFortschritt = async (wert: StatusVorlageWert) => {
    if (!mangel) return
    setFehler(null)
    setAbnahmeFormFuerWert(null)

    if (mangel.status_wert_id === wert.id) {
      setMangel((prev) => (prev ? { ...prev, status_wert_id: null, abnahme_nummer: null } : prev))
      const { error } = await supabase
        .from('maengel')
        .update({ status_wert_id: null, abnahme_nummer: null })
        .eq('id', mangelId)
      if (error) {
        setFehler(error.message)
        load()
        return
      }
      onChange?.()
      return
    }

    if (wert.titel === 'Abnahme') {
      setAbnahmeFormFuerWert(wert.id)
      setAbnahmeNummerEingabe('')
      return
    }

    setMangel((prev) => (prev ? { ...prev, status_wert_id: wert.id, abnahme_nummer: null } : prev))
    const { error } = await supabase
      .from('maengel')
      .update({ status_wert_id: wert.id, abnahme_nummer: null })
      .eq('id', mangelId)
    if (error) {
      setFehler(error.message)
      load()
      return
    }
    onChange?.()
  }

  const bestaetigeAbnahme = async (e: FormEvent) => {
    e.preventDefault()
    if (!abnahmeFormFuerWert || !abnahmeNummerEingabe.trim()) return
    setFehler(null)
    const wertId = abnahmeFormFuerWert
    const nummer = abnahmeNummerEingabe.trim()
    const { error } = await supabase
      .from('maengel')
      .update({ status_wert_id: wertId, abnahme_nummer: nummer })
      .eq('id', mangelId)
    if (error) {
      setFehler(error.message)
      return
    }
    setMangel((prev) => (prev ? { ...prev, status_wert_id: wertId, abnahme_nummer: nummer } : prev))
    setAbnahmeFormFuerWert(null)
    setAbnahmeNummerEingabe('')
    onChange?.()
  }

  const handleFortschrittHinzufuegen = async (e: FormEvent) => {
    e.preventDefault()
    if (!vorlageId || !neuerFortschrittTitel.trim()) return
    setFortschrittSaving(true)
    setFehler(null)
    const reihenfolge = werte.length > 0 ? Math.max(...werte.map((w) => w.reihenfolge)) + 1 : 1
    const { error } = await supabase.from('statusvorlage_werte').insert({
      statusvorlage_id: vorlageId,
      titel: neuerFortschrittTitel.trim(),
      farbe: neuerFortschrittFarbe,
      reihenfolge,
    })
    setFortschrittSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setNeuerFortschrittTitel('')
    setNeuerFortschrittFarbe(fortschrittFarbPalette[0])
    setFortschrittFormOffen(false)
    load()
  }

  const handleMaterialHinzufuegen = async (e: FormEvent) => {
    e.preventDefault()
    const stammEintrag = materialStamm.find((m) => m.id === neuesMaterialStammId)
    if (!user || !stammEintrag) return
    setMaterialSaving(true)
    setFehler(null)
    const reihenfolge = material.length > 0 ? Math.max(...material.map((m) => m.reihenfolge)) + 1 : 1
    const { error } = await supabase.from('mangel_material').insert({
      mangel_id: mangelId,
      material_stamm_id: stammEintrag.id,
      bezeichnung: stammEintrag.bezeichnung,
      menge: Number(neuesMaterialMenge) || 1,
      einheit: stammEintrag.einheit,
      reihenfolge,
      erstellt_von: user.id,
    })
    setMaterialSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setNeuesMaterialStammId('')
    setNeuesMaterialMenge('1')
    setMaterialFormOffen(false)
    load()
  }

  const toggleMaterialErledigt = async (materialId: string, erledigt: boolean) => {
    setFehler(null)
    setMaterial((prev) => prev.map((m) => (m.id === materialId ? { ...m, erledigt } : m)))
    const { error } = await supabase.from('mangel_material').update({ erledigt }).eq('id', materialId)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const deleteMaterial = async (materialId: string) => {
    if (!window.confirm('Diesen Materialposten wirklich löschen?')) return
    setFehler(null)
    setMaterial((prev) => prev.filter((m) => m.id !== materialId))
    const { error } = await supabase.from('mangel_material').delete().eq('id', materialId)
    if (error) {
      setFehler(error.message)
      load()
    }
  }

  const handleDokumentZuordnen = async (e: FormEvent) => {
    e.preventDefault()
    if (!auswahlDokId) return
    setZuordnenSaving(true)
    setFehler(null)
    const { error } = await supabase.from('dokumente').update({ mangel_id: mangelId }).eq('id', auswahlDokId)
    setZuordnenSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setAuswahlDokId('')
    setZuordnenOffen(false)
    load()
  }

  const handleDokumentEntfernen = async (d: Dokument) => {
    setFehler(null)
    setDokumente((prev) => prev.filter((x) => x.id !== d.id))
    const { error } = await supabase.from('dokumente').update({ mangel_id: null }).eq('id', d.id)
    if (error) setFehler(error.message)
    load()
  }

  const handleDokumentOeffnen = async (d: Dokument) => {
    const { url, error } = await getSignedUrl('dokumente', d.datei_pfad)
    if (url) window.open(url, '_blank', 'noreferrer')
    else if (error) setFehler(error)
  }

  const handleDokumentLoeschen = async (d: Dokument) => {
    if (!window.confirm(`"${d.name}" wirklich löschen?`)) return
    setFehler(null)
    setDokumente((prev) => prev.filter((x) => x.id !== d.id))
    const { error } = await supabase.from('dokumente').delete().eq('id', d.id)
    if (error) {
      setFehler(error.message)
      load()
      return
    }
    await supabase.storage.from('dokumente').remove([d.datei_pfad])
  }

  const handleKommentarSenden = async (e: FormEvent) => {
    e.preventDefault()
    if (!user || (!kommentarText.trim() && !kommentarFoto)) return
    setKommentarSaving(true)
    setFehler(null)

    let foto_pfad: string | null = null
    if (kommentarFoto) {
      const kommentarFotoKomprimiert = await komprimiereBild(kommentarFoto)
      const { path, error: uploadError } = await uploadFile('mangel-fotos', `kommentare/${mangelId}`, kommentarFotoKomprimiert)
      if (uploadError) {
        setKommentarSaving(false)
        setFehler(`Foto-Upload fehlgeschlagen: ${uploadError}`)
        return
      }
      foto_pfad = path
    }

    const { error } = await supabase.from('mangel_kommentare').insert({
      mangel_id: mangelId,
      text: kommentarText.trim() || null,
      foto_pfad,
      erstellt_von: user.id,
    })

    setKommentarSaving(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setKommentarText('')
    setKommentarFoto(null)
    load()
  }

  if (loading) return <p className="text-sm text-text-muted">Lädt…</p>

  return (
    <div className="space-y-5">
      {fehler && <p className="banner-error">Fehler: {fehler}</p>}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text">Fortschritt</h3>
          {kannFortschrittDefinieren && vorlageId && (
            <button
              type="button"
              onClick={() => setFortschrittFormOffen((v) => !v)}
              className="text-xs font-medium text-brand"
            >
              {fortschrittFormOffen ? 'Abbrechen' : '+ Aufgabe'}
            </button>
          )}
        </div>

        {fortschrittFormOffen && (
          <form onSubmit={handleFortschrittHinzufuegen} className="mb-2 space-y-2">
            <input
              autoFocus
              value={neuerFortschrittTitel}
              onChange={(e) => setNeuerFortschrittTitel(e.target.value)}
              placeholder="Bezeichnung, z. B. Kabelkanal setzen"
              className="field-input"
            />
            <div className="flex flex-wrap items-center gap-2">
              {fortschrittFarbPalette.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setNeuerFortschrittFarbe(c)}
                  style={{ backgroundColor: c }}
                  className={`h-6 w-6 flex-shrink-0 rounded-full ${
                    neuerFortschrittFarbe === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-text' : ''
                  }`}
                />
              ))}
              <button type="submit" disabled={fortschrittSaving} className="btn-primary ml-auto flex-shrink-0">
                Hinzufügen
              </button>
            </div>
          </form>
        )}

        {werte.length === 0 ? (
          <p className="text-xs text-text-subtle">Keine Fortschrittsstufen verfügbar.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {werte.map((w) => {
              const aktiv = mangel?.status_wert_id === w.id
              return (
                <button
                  key={w.id}
                  type="button"
                  disabled={!kannBearbeiten}
                  onClick={() => waehleFortschritt(w)}
                  style={
                    aktiv
                      ? { backgroundColor: w.farbe, borderColor: w.farbe }
                      : { borderColor: w.farbe, color: w.farbe }
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                    aktiv ? 'text-white' : 'bg-transparent'
                  }`}
                >
                  {w.titel}
                </button>
              )
            })}
          </div>
        )}

        {abnahmeFormFuerWert && (
          <form onSubmit={bestaetigeAbnahme} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border p-2">
            <div className="min-w-[10rem] flex-1">
              <label className="field-label">Abnahme-Nummer</label>
              <input
                required
                autoFocus
                value={abnahmeNummerEingabe}
                onChange={(e) => setAbnahmeNummerEingabe(e.target.value)}
                placeholder="z. B. Protokoll-Nr."
                className="field-input"
              />
            </div>
            <button type="submit" className="btn-primary flex-shrink-0">
              Bestätigen
            </button>
            <button
              type="button"
              onClick={() => setAbnahmeFormFuerWert(null)}
              className="btn-secondary flex-shrink-0"
            >
              Abbrechen
            </button>
          </form>
        )}

        {mangel?.abnahme_nummer && (
          <p className="mt-1 text-xs text-text-subtle">Abnahme-Nummer: {mangel.abnahme_nummer}</p>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text">Materialliste</h3>
          {kannMaterialDefinieren && (
            <button
              onClick={() => setMaterialFormOffen((v) => !v)}
              className="text-xs font-medium text-brand"
            >
              {materialFormOffen ? 'Abbrechen' : '+ Material'}
            </button>
          )}
        </div>

        {materialFormOffen && (
          <form onSubmit={handleMaterialHinzufuegen} className="mb-2 space-y-2">
            {materialStamm.length === 0 ? (
              <p className="text-xs text-text-subtle">
                Noch kein Material im Materialstamm angelegt. Unter Einstellungen → Materialstamm zuerst welches
                anlegen.
              </p>
            ) : (
              <div className="flex gap-2">
                <select
                  autoFocus
                  value={neuesMaterialStammId}
                  onChange={(e) => setNeuesMaterialStammId(e.target.value)}
                  className="field-input flex-1"
                >
                  <option value="">— Material wählen —</option>
                  {materialStamm.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.bezeichnung}
                      {m.einheit ? ` (${m.einheit})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={neuesMaterialMenge}
                  onChange={(e) => setNeuesMaterialMenge(e.target.value)}
                  placeholder="Menge"
                  className="field-input w-20"
                />
                <button
                  type="submit"
                  disabled={materialSaving || !neuesMaterialStammId}
                  className="btn-primary flex-shrink-0"
                >
                  Hinzufügen
                </button>
              </div>
            )}
          </form>
        )}

        {material.length === 0 ? (
          <p className="text-xs text-text-subtle">Noch kein Material festgelegt.</p>
        ) : (
          <ul className="space-y-1.5">
            {material.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={m.erledigt}
                  disabled={!kannMaterialAbhaken}
                  onChange={() => toggleMaterialErledigt(m.id, !m.erledigt)}
                  className="flex-shrink-0"
                />
                <div className={`min-w-0 flex-1 text-sm ${m.erledigt ? 'text-text-subtle line-through' : 'text-text'}`}>
                  {m.bezeichnung}
                  <span className="ml-1 text-xs text-text-subtle">
                    ({m.menge}
                    {m.einheit ? ` ${m.einheit}` : ''})
                  </span>
                </div>
                {kannMaterialDefinieren && (
                  <button
                    onClick={() => deleteMaterial(m.id)}
                    className="flex-shrink-0 text-xs text-text-subtle hover:text-red-600 dark:hover:text-red-400"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text">Dokumente ({dokumente.length})</h3>
          {kannBearbeiten && (
            <button onClick={() => setZuordnenOffen((v) => !v)} className="text-xs font-medium text-brand">
              {zuordnenOffen ? 'Abbrechen' : '+ Zuordnen'}
            </button>
          )}
        </div>

        {zuordnenOffen &&
          (freieDokumente.length === 0 ? (
            <p className="mb-2 text-xs text-text-subtle">
              Keine hochgeladenen Aufgabendokumente verfügbar. Erst{' '}
              {mangel && (
                <Link to={`/baustellen/${mangel.baustelle_id}/dokumente`} className="text-brand hover:underline">
                  auf der Dokumente-Seite
                </Link>
              )}{' '}
              hochladen.
            </p>
          ) : (
            <form onSubmit={handleDokumentZuordnen} className="mb-2 flex items-center gap-2">
              <select
                required
                value={auswahlDokId}
                onChange={(e) => setAuswahlDokId(e.target.value)}
                className="field-input min-w-0 flex-1"
              >
                <option value="">Aufgabendokument wählen…</option>
                {freieDokumente.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={zuordnenSaving || !auswahlDokId} className="btn-primary flex-shrink-0">
                {zuordnenSaving ? 'Ordnet zu…' : 'Zuordnen'}
              </button>
            </form>
          ))}

        {dokumente.length === 0 ? (
          <p className="text-xs text-text-subtle">Noch keine Dokumente zu dieser Aufgabe zugeordnet.</p>
        ) : (
          <ul className="space-y-1.5">
            {dokumente.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-text-muted" strokeWidth={2.25} />
                <button
                  onClick={() => handleDokumentOeffnen(d)}
                  className="min-w-0 flex-1 truncate text-left text-sm text-text hover:text-brand"
                >
                  {d.name}
                </button>
                {kannBearbeiten && (
                  <button
                    onClick={() => handleDokumentEntfernen(d)}
                    title="Zuordnung entfernen"
                    className="flex-shrink-0 text-text-subtle hover:text-text"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                )}
                {kannMaterialDefinieren && (
                  <button
                    onClick={() => handleDokumentLoeschen(d)}
                    title="Endgültig löschen"
                    className="flex-shrink-0 text-text-subtle hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-text">Kommentare ({kommentare.length})</h3>

        {kommentare.length > 0 && (
          <ul className="mb-3 space-y-3">
            {kommentare.map((k) => (
              <li key={k.id} className="flex gap-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-hover text-xs font-medium text-text-muted">
                  {nameOf(k.erstellt_von).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-text">{nameOf(k.erstellt_von)}</span>
                    <span className="text-xs text-text-subtle">{relativZeit(k.erstellt_am)}</span>
                  </div>
                  {k.text && <p className="mt-0.5 text-sm text-text-muted">{k.text}</p>}
                  {k.foto_pfad && (
                    <button
                      type="button"
                      onClick={async () => {
                        const { url } = await getSignedUrl('mangel-fotos', k.foto_pfad!)
                        if (url) window.open(url, '_blank', 'noreferrer')
                      }}
                    >
                      <SignedImage
                        bucket="mangel-fotos"
                        path={k.foto_pfad}
                        alt=""
                        className="mt-1 h-24 w-24 rounded-lg object-cover"
                      />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {kannBearbeiten && (
          <form onSubmit={handleKommentarSenden} className="space-y-2">
            <textarea
              value={kommentarText}
              onChange={(e) => setKommentarText(e.target.value)}
              rows={2}
              placeholder="Kommentar schreiben…"
              className="field-input"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="btn-secondary min-w-0 cursor-pointer text-xs">
                <span className="truncate">{kommentarFoto ? `📷 ${kommentarFoto.name}` : '📷 Foto anhängen'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setKommentarFoto(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              <button
                type="submit"
                disabled={kommentarSaving || (!kommentarText.trim() && !kommentarFoto)}
                className="btn-primary flex-shrink-0"
              >
                {kommentarSaving ? 'Sendet…' : 'Kommentieren'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
