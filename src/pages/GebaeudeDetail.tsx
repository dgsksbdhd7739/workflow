import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, Layers, Map as MapIcon, MapPin, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { backend } from '../lib/backend'
import { STATUS_FARBE, STATUS_TEXT, gebaeudeAuswerten, geschossName, type BereichAuswertung, type BereichStatus } from '../lib/gebaeude3d'
import type { Aufgabe, Einheit, Gebaeude, Geschoss, Projekt, Termin } from '../types/database'
import { PlanAufbau } from '../components/PlanAufbau'

// three.js nur laden, wenn ein Gebaeude geoeffnet wird.
const Gebaeude3D = lazy(() => import('../components/Gebaeude3D'))

function Statuspunkt({ status }: { status: BereichStatus }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10" style={{ background: STATUS_FARBE[status] }} />
}

function Fortschritt({ a }: { a: BereichAuswertung | undefined }) {
  if (!a || a.fortschritt === null) return <span className="text-xs text-text-subtle">–</span>
  return (
    <span className="text-xs text-text-muted">
      {a.aufgabenErledigt}/{a.aufgabenGesamt} erledigt
      {a.verzoegerteTermine > 0 && <span className="ml-1 font-medium text-red-600 dark:text-red-400">· {a.verzoegerteTermine} im Verzug</span>}
    </span>
  )
}

export function GebaeudeDetail() {
  const { id: projektId, gebaeudeId } = useParams<{ id: string; gebaeudeId: string }>()
  const { role, user } = useAuth()
  const [gebaeude, setGebaeude] = useState<Gebaeude | null>(null)
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [geschosse, setGeschosse] = useState<Geschoss[]>([])
  const [einheiten, setEinheiten] = useState<Einheit[]>([])
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([])
  const [termine, setTermine] = useState<Termin[]>([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [aktionsFehler, setAktionsFehler] = useState<string | null>(null)
  const [geschossId, setGeschossId] = useState<string | null>(null)
  const [einheitId, setEinheitId] = useState<string | null>(null)
  const [arbeitet, setArbeitet] = useState(false)

  // Assistent und Formulare
  const [anzahlUG, setAnzahlUG] = useState('0')
  const [anzahlOG, setAnzahlOG] = useState('3')
  const [wohnungenJe, setWohnungenJe] = useState('4')
  const [neueEinheit, setNeueEinheit] = useState('')
  const [neueAufgabe, setNeueAufgabe] = useState('')

  const kannBearbeiten = role === 'admin' || role === 'planer'

  const laden = useCallback(async () => {
    if (!projektId || !gebaeudeId) return
    const [gRes, pRes, gsRes, eRes, aRes, tRes] = await Promise.all([
      backend.from('gebaeude').select('*').eq('id', gebaeudeId).eq('projekt_id', projektId).maybeSingle(),
      backend.from('projekte').select('*').eq('id', projektId).maybeSingle(),
      backend.from('geschosse').select('*').eq('gebaeude_id', gebaeudeId).order('ebene'),
      backend.from('einheiten').select('*').eq('projekt_id', projektId).order('reihenfolge'),
      backend.from('aufgaben').select('*').eq('projekt_id', projektId),
      backend.from('termine').select('*').eq('projekt_id', projektId),
    ])
    if (gRes.error || pRes.error) {
      setFehler('Das Gebäude konnte nicht geladen werden. Bitte versuche es erneut.')
    } else if (!gRes.data || !pRes.data) {
      setFehler('Das Gebäude oder das Projekt wurde nicht gefunden oder du hast keinen Zugriff.')
    } else {
      const gs = (gsRes.data ?? []) as Geschoss[]
      const ids = new Set(gs.map((g) => g.id))
      setGebaeude(gRes.data as Gebaeude)
      setProjekt(pRes.data as Projekt)
      setGeschosse(gs)
      setEinheiten(((eRes.data ?? []) as Einheit[]).filter((e) => ids.has(e.geschoss_id)))
      setAufgaben((aRes.data ?? []) as Aufgabe[])
      setTermine((tRes.data ?? []) as Termin[])
    }
    setLoading(false)
  }, [projektId, gebaeudeId])

  useEffect(() => {
    laden()
  }, [laden])

  const auswertung = useMemo(
    () => gebaeudeAuswerten(gebaeudeId ?? '', geschosse, einheiten, aufgaben, termine),
    [gebaeudeId, geschosse, einheiten, aufgaben, termine],
  )

  const geschoss = geschosse.find((g) => g.id === geschossId) ?? null
  const einheit = einheiten.find((e) => e.id === einheitId) ?? null
  const einheitenDesGeschosses = einheiten
    .filter((e) => e.geschoss_id === geschossId)
    .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de', { numeric: true }))
  const aufgabenDerEinheit = aufgaben.filter((a) => a.einheit_id === einheitId)

  const waehleGeschoss = (id: string | null) => {
    setGeschossId(id)
    setEinheitId(null)
  }

  async function ausfuehren(aktion: () => PromiseLike<{ error: { message: string } | null }>) {
    setArbeitet(true)
    setAktionsFehler(null)
    const { error } = await aktion()
    if (error) setAktionsFehler(error.message)
    await laden()
    setArbeitet(false)
    return !error
  }

  const geschosseAnlegen = async (e: FormEvent) => {
    e.preventDefault()
    if (!projektId || !gebaeudeId) return
    const ug = Math.min(Math.max(Number(anzahlUG) || 0, 0), 5)
    const og = Math.min(Math.max(Number(anzahlOG) || 0, 0), 60)
    const whg = Math.min(Math.max(Number(wohnungenJe) || 0, 0), 30)
    await ausfuehren(async () => {
      const zeilen = []
      for (let ebene = -ug; ebene <= og; ebene++) {
        zeilen.push({ gebaeude_id: gebaeudeId, projekt_id: projektId, name: geschossName(ebene, ug), ebene })
      }
      const res = await backend.from('geschosse').insert(zeilen).select()
      if (res.error || whg === 0) return res
      // Wohnungen nur in EG und OGs, Untergeschosse bekommen einen Technik-/Kellerbereich.
      const einheitenZeilen = (res.data as Geschoss[]).flatMap((g) =>
        g.ebene < 0
          ? [{ geschoss_id: g.id, projekt_id: projektId, name: `Keller ${g.name}`, art: 'technik', reihenfolge: 0 }]
          : Array.from({ length: whg }, (_, i) => ({
              geschoss_id: g.id,
              projekt_id: projektId,
              name: `Whg ${g.ebene}.${i + 1}`,
              reihenfolge: i,
            })),
      )
      return backend.from('einheiten').insert(einheitenZeilen)
    })
  }

  const geschossHinzufuegen = async () => {
    if (!projektId || !gebaeudeId) return
    const ebene = geschosse.length ? Math.max(...geschosse.map((g) => g.ebene)) + 1 : 0
    const ug = geschosse.filter((g) => g.ebene < 0).length
    await ausfuehren(() =>
      backend.from('geschosse').insert({ gebaeude_id: gebaeudeId, projekt_id: projektId, name: geschossName(ebene, ug), ebene }),
    )
  }

  const geschossLoeschen = async (g: Geschoss) => {
    if (!window.confirm(`${g.name} mit allen Einheiten löschen? Zugeordnete Aufgaben bleiben erhalten, verlieren aber die Zuordnung.`)) return
    if (await ausfuehren(() => backend.from('geschosse').delete().eq('id', g.id))) waehleGeschoss(null)
  }

  const einheitHinzufuegen = async (e: FormEvent) => {
    e.preventDefault()
    if (!projektId || !geschoss || !neueEinheit.trim()) return
    const reihenfolge = einheitenDesGeschosses.length ? Math.max(...einheitenDesGeschosses.map((x) => x.reihenfolge)) + 1 : 0
    if (await ausfuehren(() => backend.from('einheiten').insert({ geschoss_id: geschoss.id, projekt_id: projektId, name: neueEinheit.trim(), reihenfolge }))) {
      setNeueEinheit('')
    }
  }

  const einheitLoeschen = async (x: Einheit) => {
    if (!window.confirm(`${x.name} löschen? Zugeordnete Aufgaben bleiben erhalten.`)) return
    if (await ausfuehren(() => backend.from('einheiten').delete().eq('id', x.id))) setEinheitId(null)
  }

  const aufgabeAnlegen = async (e: FormEvent) => {
    e.preventDefault()
    if (!projektId || !einheit || !user || !neueAufgabe.trim()) return
    if (await ausfuehren(() => backend.from('aufgaben').insert({ projekt_id: projektId, titel: neueAufgabe.trim(), erstellt_von: user.id, einheit_id: einheit.id }))) {
      setNeueAufgabe('')
    }
  }

  if (loading) return <p className="p-6 text-sm text-text-muted">Gebäude wird geladen…</p>
  if (fehler || !gebaeude || !projekt || !projektId) {
    return (
      <div className="page">
        <p className="banner-error">{fehler ?? 'Gebäude nicht verfügbar.'}</p>
        {projektId && <Link className="btn-secondary mt-4" to={`/projekte/${projektId}`}>Zur Projektübersicht</Link>}
      </div>
    )
  }

  const gesamt = auswertung.gesamt
  const geschosseAbsteigend = [...geschosse].sort((a, b) => b.ebene - a.ebene)

  // Volle Breite statt .page (max-w-3xl), damit die 3D-Ansicht Platz hat
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link to={`/projekte/${projektId}`} className="mb-4 inline-flex items-center gap-2 text-sm text-text-muted hover:text-brand">
        <ArrowLeft className="h-4 w-4" /> Zurück zum Projekt
      </Link>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Gebäude · {projekt.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-text">{gebaeude.name}</h1>
          {gebaeude.adresse && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
              <MapPin className="h-4 w-4" /> {gebaeude.adresse}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link to={`/projekte/${projektId}/plaene`} className="btn-secondary"><MapIcon className="h-4 w-4" /> Pläne</Link>
          <Link to={`/projekte/${projektId}/aufgaben`} className="btn-secondary"><ClipboardList className="h-4 w-4" /> Aufgaben</Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3">
          <p className="text-xs text-text-muted">Baufortschritt</p>
          <p className="text-xl font-semibold text-text">{gesamt.fortschritt === null ? '–' : `${Math.round(gesamt.fortschritt * 100)} %`}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-text-muted">Offene Aufgaben</p>
          <p className="text-xl font-semibold text-text">{gesamt.aufgabenGesamt - gesamt.aufgabenErledigt}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-text-muted">Termine im Verzug</p>
          <p className={`text-xl font-semibold ${gesamt.verzoegerteTermine ? 'text-red-600 dark:text-red-400' : 'text-text'}`}>{gesamt.verzoegerteTermine}</p>
        </div>
        <div className="card p-3">
          <p className="text-xs text-text-muted">Geschosse · Einheiten</p>
          <p className="text-xl font-semibold text-text">{geschosse.length} · {einheiten.length}</p>
        </div>
      </div>

      {aktionsFehler && <p className="banner-error mb-4">{aktionsFehler}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card relative h-[75vh] min-h-[28rem] overflow-hidden">
          <Suspense fallback={<p className="p-6 text-sm text-text-muted">3D-Ansicht wird geladen…</p>}>
            <Gebaeude3D
              gebaeude={gebaeude}
              geschosse={geschosse}
              einheiten={einheiten}
              auswertung={auswertung}
              geschossId={geschossId}
              einheitId={einheitId}
              onGeschoss={waehleGeschoss}
              onEinheit={setEinheitId}
            />
          </Suspense>
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-surface/90 px-2.5 py-1.5 text-[11px] text-text-muted shadow-sm">
            {(Object.keys(STATUS_TEXT) as BereichStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1"><Statuspunkt status={s} /> {STATUS_TEXT[s]}</span>
            ))}
          </div>
          <p className="pointer-events-none absolute right-3 top-3 rounded bg-surface/90 px-2 py-1 text-[11px] text-text-subtle shadow-sm">
            Ziehen zum Drehen · Etage anklicken
          </p>
        </section>

        <aside className="space-y-4">
          {kannBearbeiten && (
            <PlanAufbau projektId={projektId} gebaeude={gebaeude} geschosse={geschosse} einheiten={einheiten} onFertig={laden} />
          )}
          {geschosse.length === 0 ? (
            <section className="card p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-text"><Layers className="h-4 w-4 text-brand" /> Geschosse anlegen</h2>
              {kannBearbeiten ? (
                <form onSubmit={geschosseAnlegen} className="mt-3 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs"><span className="field-label">UG</span><input className="field-input" type="number" min={0} max={5} value={anzahlUG} onChange={(e) => setAnzahlUG(e.target.value)} /></label>
                    <label className="text-xs"><span className="field-label">OG</span><input className="field-input" type="number" min={0} max={60} value={anzahlOG} onChange={(e) => setAnzahlOG(e.target.value)} /></label>
                    <label className="text-xs"><span className="field-label">Whg./Etage</span><input className="field-input" type="number" min={0} max={30} value={wohnungenJe} onChange={(e) => setWohnungenJe(e.target.value)} /></label>
                  </div>
                  <p className="text-xs text-text-muted">Legt EG, {Number(anzahlOG) || 0} Obergeschoss(e){Number(anzahlUG) ? ` und ${anzahlUG} Untergeschoss(e)` : ''} an, mit je {Number(wohnungenJe) || 0} Wohnungen. Namen lassen sich danach anpassen.</p>
                  <button className="btn-primary w-full" disabled={arbeitet}>{arbeitet ? 'Legt an…' : 'Geschosse anlegen'}</button>
                </form>
              ) : (
                <p className="mt-2 text-sm text-text-muted">Für dieses Gebäude sind noch keine Geschosse angelegt.</p>
              )}
            </section>
          ) : (
            <section className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-text"><Layers className="h-4 w-4 text-brand" /> Etagen {geschosse.length}</h2>
                {kannBearbeiten && (
                  <button type="button" onClick={geschossHinzufuegen} disabled={arbeitet} className="btn-ghost px-2 py-1 text-xs"><Plus className="h-3.5 w-3.5" /> Etage</button>
                )}
              </div>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {geschosseAbsteigend.map((g) => {
                  const a = auswertung.geschoss.get(g.id)
                  const anzahl = einheiten.filter((e) => e.geschoss_id === g.id).length
                  const aktiv = g.id === geschossId
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => waehleGeschoss(aktiv ? null : g.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${aktiv ? 'bg-brand-soft text-brand' : 'hover:bg-surface-hover'}`}
                      >
                        <Statuspunkt status={a?.status ?? 'leer'} />
                        <span className="w-14 font-medium">{g.name}</span>
                        <span className="flex-1 text-xs text-text-muted">{anzahl} Einheit{anzahl === 1 ? '' : 'en'}</span>
                        <Fortschritt a={a} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {geschoss && !einheit && (
            <section className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text">{geschoss.name}</h2>
                {kannBearbeiten && (
                  <button type="button" onClick={() => geschossLoeschen(geschoss)} className="btn-ghost px-2 py-1 text-xs text-red-600"><Trash2 className="h-3.5 w-3.5" /> Etage löschen</button>
                )}
              </div>
              {einheitenDesGeschosses.length === 0 && <p className="text-sm text-text-muted">Noch keine Einheiten auf dieser Etage.</p>}
              <ul className="space-y-1">
                {einheitenDesGeschosses.map((x) => {
                  const a = auswertung.einheit.get(x.id)
                  return (
                    <li key={x.id}>
                      <button type="button" onClick={() => setEinheitId(x.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-hover">
                        <Statuspunkt status={a?.status ?? 'leer'} />
                        <span className="flex-1 font-medium">{x.name}</span>
                        <Fortschritt a={a} />
                      </button>
                    </li>
                  )
                })}
              </ul>
              {kannBearbeiten && (
                <form onSubmit={einheitHinzufuegen} className="mt-3 flex gap-2">
                  <input className="field-input" placeholder="z. B. Whg 3.5" value={neueEinheit} onChange={(e) => setNeueEinheit(e.target.value)} />
                  <button className="btn-secondary shrink-0" disabled={arbeitet || !neueEinheit.trim()}><Plus className="h-4 w-4" /></button>
                </form>
              )}
            </section>
          )}

          {einheit && (
            <section className="card p-4">
              <div className="mb-1 flex items-center justify-between">
                <button type="button" onClick={() => setEinheitId(null)} className="text-xs text-text-muted hover:text-brand">← {geschoss?.name}</button>
                {kannBearbeiten && (
                  <button type="button" onClick={() => einheitLoeschen(einheit)} className="btn-ghost px-2 py-1 text-xs text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-text">
                <Statuspunkt status={auswertung.einheit.get(einheit.id)?.status ?? 'leer'} /> {einheit.name}
              </h2>
              <p className="mb-3 text-xs text-text-muted">
                {STATUS_TEXT[auswertung.einheit.get(einheit.id)?.status ?? 'leer']}
                {einheit.flaeche_m2 ? ` · ${einheit.flaeche_m2} m²` : ''}
              </p>
              {aufgabenDerEinheit.length === 0 ? (
                <p className="text-sm text-text-muted">Noch keine Aufgaben für diese Einheit.</p>
              ) : (
                <ul className="space-y-1">
                  {aufgabenDerEinheit.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <Statuspunkt status={a.status === 'erledigt' ? 'fertig' : a.status === 'in_bearbeitung' ? 'in_arbeit' : 'offen'} />
                      <Link to={`/projekte/${projektId}/aufgaben?aufgabe=${a.id}`} className="flex-1 truncate hover:text-brand">{a.titel}</Link>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={aufgabeAnlegen} className="mt-3 flex gap-2">
                <input className="field-input" placeholder="Neue Aufgabe für diese Einheit" value={neueAufgabe} onChange={(e) => setNeueAufgabe(e.target.value)} />
                <button className="btn-secondary shrink-0" disabled={arbeitet || !neueAufgabe.trim()}><Plus className="h-4 w-4" /></button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
