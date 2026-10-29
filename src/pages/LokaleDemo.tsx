import { useState, type FormEvent } from 'react'
import { ArrowLeft, Building2, ClipboardList, HardHat, Map as MapIcon, MapPin, Plus, Trash2 } from 'lucide-react'

type DemoGebaeude = {
  id: string
  name: string
  adresse: string
  beschreibung: string
}

const demoSpeicherKey = 'workflow-lokale-gebaeude-demo-v1'

const startGebaeude: DemoGebaeude[] = [
  { id: 'haus-a', name: 'Haus A', adresse: 'Baufeld Nord', beschreibung: 'Rohbau und technischer Ausbau' },
  { id: 'haus-b', name: 'Haus B', adresse: 'Baufeld Mitte', beschreibung: 'Innenausbau und Gebäudetechnik' },
  { id: 'baustellenbuero', name: 'Baustellenbüro', adresse: 'Zufahrt West', beschreibung: 'Baustellenlogistik und Projektleitung' },
]

function ladeGebaeude(): DemoGebaeude[] {
  try {
    const gespeichert = localStorage.getItem(demoSpeicherKey)
    if (!gespeichert) return startGebaeude
    const geparst: unknown = JSON.parse(gespeichert)
    if (!Array.isArray(geparst)) return startGebaeude
    return geparst.filter(
      (eintrag): eintrag is DemoGebaeude =>
        typeof eintrag === 'object' &&
        eintrag !== null &&
        'id' in eintrag && typeof eintrag.id === 'string' &&
        'name' in eintrag && typeof eintrag.name === 'string' &&
        'adresse' in eintrag && typeof eintrag.adresse === 'string' &&
        'beschreibung' in eintrag && typeof eintrag.beschreibung === 'string',
    )
  } catch {
    return startGebaeude
  }
}

export function LokaleDemo() {
  const [gebaeude, setGebaeude] = useState<DemoGebaeude[]>(ladeGebaeude)
  const [ausgewaehlt, setAusgewaehlt] = useState<string | null>(null)
  const [formularOffen, setFormularOffen] = useState(false)
  const [name, setName] = useState('')
  const [adresse, setAdresse] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [speicherHinweis, setSpeicherHinweis] = useState<string | null>(null)

  const speichereGebaeude = (neu: DemoGebaeude[]) => {
    setGebaeude(neu)
    try {
      localStorage.setItem(demoSpeicherKey, JSON.stringify(neu))
      setSpeicherHinweis(null)
    } catch {
      setSpeicherHinweis('Der Browser konnte die lokale Änderung nicht dauerhaft speichern.')
    }
  }

  const handleAnlegen = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nameBereinigt = name.trim()
    if (!nameBereinigt) return
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`
    speichereGebaeude([...gebaeude, { id, name: nameBereinigt, adresse: adresse.trim(), beschreibung: beschreibung.trim() }])
    setAusgewaehlt(id)
    setName('')
    setAdresse('')
    setBeschreibung('')
    setFormularOffen(false)
  }

  const handleLoeschen = (eintrag: DemoGebaeude) => {
    if (!window.confirm(`„${eintrag.name}“ aus den lokalen Demodaten entfernen?`)) return
    speichereGebaeude(gebaeude.filter((g) => g.id !== eintrag.id))
    setAusgewaehlt(null)
  }

  const aktuellesGebaeude = gebaeude.find((g) => g.id === ausgewaehlt)

  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-text sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center gap-3">
          <div className="logo-tile h-11 w-11 shrink-0"><HardHat className="h-6 w-6" strokeWidth={2.25} /></div>
          <div>
            <p className="text-xl font-extrabold tracking-tight">Work<span className="brand-text">Flow</span></p>
            <p className="text-xs text-text-muted">Lokale Gebäude-Demo</p>
          </div>
        </header>

        <aside className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Demo-Modus – keine Verbindung zum Server.</strong> Es werden ausschließlich Beispieldaten verwendet. Änderungen werden nur in diesem Browser bzw. auf diesem Gerät gespeichert und nicht synchronisiert.
        </aside>

        {speicherHinweis && <p className="banner-error mb-4">{speicherHinweis}</p>}

        {aktuellesGebaeude ? (
          <>
            <button type="button" onClick={() => setAusgewaehlt(null)} className="mb-4 inline-flex items-center gap-2 text-sm text-text-muted hover:text-brand">
              <ArrowLeft className="h-4 w-4" /> Zur Baustellenübersicht
            </button>
            <section className="card mb-5 overflow-hidden">
              <div className="flex min-h-56 items-center justify-center bg-gradient-to-br from-brand-soft via-surface to-surface-hover p-8">
                <div className="flex h-36 w-36 items-center justify-center rounded-3xl border border-brand/20 bg-surface shadow-lg shadow-brand/10">
                  <Building2 className="h-24 w-24 text-brand" strokeWidth={1.2} aria-hidden="true" />
                </div>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand">Demo-Baustelle · Wohnanlage Musterhof</p>
                  <h1 className="mt-1 text-2xl font-semibold">{aktuellesGebaeude.name}</h1>
                  {aktuellesGebaeude.adresse && <p className="mt-2 flex items-center gap-1.5 text-sm text-text-muted"><MapPin className="h-4 w-4" />{aktuellesGebaeude.adresse}</p>}
                  {aktuellesGebaeude.beschreibung && <p className="mt-2 text-sm text-text-muted">{aktuellesGebaeude.beschreibung}</p>}
                </div>
                <button type="button" className="btn-secondary text-red-600" onClick={() => handleLoeschen(aktuellesGebaeude)}><Trash2 className="h-4 w-4" /> Entfernen</button>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <section className="card p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MapIcon className="h-4 w-4 text-brand" /> Projektpläne · Beispieldaten</h2>
                <ul className="space-y-2 text-sm text-text-muted"><li className="rounded-lg bg-surface-hover px-3 py-2">Grundriss Erdgeschoss.pdf</li><li className="rounded-lg bg-surface-hover px-3 py-2">Übersicht Haustechnik.png</li></ul>
              </section>
              <section className="card p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ClipboardList className="h-4 w-4 text-brand" /> Aufgaben · Beispieldaten</h2>
                <ul className="space-y-2 text-sm text-text-muted"><li className="flex items-center justify-between gap-2 rounded-lg bg-surface-hover px-3 py-2"><span>Elektro-Rohinstallation prüfen</span><span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">In Arbeit</span></li><li className="flex items-center justify-between gap-2 rounded-lg bg-surface-hover px-3 py-2"><span>Fensteranschlüsse kontrollieren</span><span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">Erledigt</span></li></ul>
              </section>
            </div>
            <p className="mt-4 text-center text-xs text-text-subtle">Geschosse und Wohnungen können im nächsten Schritt ergänzt werden.</p>
          </>
        ) : (
          <>
            <section className="mb-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-lg sm:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">Projekt · Demo</p>
              <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Wohnanlage Musterhof</h1>
              <p className="mt-2 text-sm text-slate-300">Baustellenübersicht · Musterstraße 12, Hamburg</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">64%</p><p className="text-xs text-slate-300">Baufortschritt</p></div>
                <div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">8</p><p className="text-xs text-slate-300">Personal heute</p></div>
                <div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold">12</p><p className="text-xs text-slate-300">Offene Aufgaben</p></div>
                <div className="rounded-xl bg-white/10 p-3"><p className="text-2xl font-bold text-amber-300">2</p><p className="text-xs text-slate-300">Verzögerte Termine</p></div>
              </div>
            </section>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Gebäude auf der Baustelle</h2><p className="text-sm text-text-muted">Wähle ein Gebäude, um die Demo-Details zu öffnen.</p></div>
              <button type="button" className="btn-primary" onClick={() => setFormularOffen((offen) => !offen)}><Plus className="h-4 w-4" /> Gebäude hinzufügen</button>
            </div>

            {formularOffen && (
              <form onSubmit={handleAnlegen} className="card mb-4 space-y-3 p-4">
                <h3 className="text-sm font-semibold">Gebäude lokal hinzufügen</h3>
                <label className="block"><span className="field-label">Name *</span><input autoFocus required maxLength={120} className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Haus C" /></label>
                <label className="block"><span className="field-label">Bereich oder Adresse</span><input maxLength={240} className="field-input" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="z. B. Baufeld Süd" /></label>
                <label className="block"><span className="field-label">Beschreibung</span><textarea rows={2} maxLength={1000} className="field-input resize-y" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} /></label>
                <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setFormularOffen(false)}>Abbrechen</button><button type="submit" className="btn-primary" disabled={!name.trim()}>Lokal speichern</button></div>
              </form>
            )}

            {gebaeude.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {gebaeude.map((eintrag, index) => (
                  <button type="button" key={eintrag.id} onClick={() => setAusgewaehlt(eintrag.id)} className="card group overflow-hidden text-left transition-colors hover:border-brand/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                    <div className={`flex h-36 items-end justify-center bg-gradient-to-br ${index % 2 ? 'from-cyan-100 via-slate-100 to-indigo-100 dark:from-cyan-950/40 dark:via-slate-900 dark:to-indigo-950/50' : 'from-amber-100 via-slate-100 to-orange-100 dark:from-amber-950/40 dark:via-slate-900 dark:to-orange-950/50'} px-4 pt-5`}>
                      <div className="flex h-28 w-24 items-center justify-center rounded-t-lg border-x border-t border-slate-300 bg-white/80 shadow-lg transition-transform group-hover:-translate-y-1 dark:border-slate-600 dark:bg-slate-800/80">
                        <Building2 className="h-16 w-16 text-brand" strokeWidth={1.2} aria-hidden="true" />
                      </div>
                    </div>
                    <div className="p-4"><h3 className="font-semibold">{eintrag.name}</h3>{eintrag.adresse && <p className="mt-1 text-sm text-text-muted">{eintrag.adresse}</p>}<p className="mt-2 text-xs text-text-subtle">{eintrag.beschreibung || 'Gebäudedetails und Beispielpläne öffnen'}</p><span className="mt-3 inline-flex text-xs font-semibold text-brand">Gebäude öffnen →</span></div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="card p-8 text-center text-sm text-text-muted">Noch keine lokalen Gebäude angelegt.</div>
            )}
          </>
        )}

        <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-text-subtle">Lokale Demo · Beispieldaten · keine Anmeldung · keine Synchronisierung</footer>
      </div>
    </main>
  )
}
