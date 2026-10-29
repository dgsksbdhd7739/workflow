import { useEffect, useState, type FormEvent } from 'react'
import { backend, funktionsFehler } from '../lib/backend'
import { useAuth } from '../contexts/AuthContext'
import { UnternehmenForm } from '../components/UnternehmenForm'
import { formatDatum } from '../lib/datum'
import type { PlattformUnternehmenUebersicht } from '../types/database'
import { PAKETE, PAKET_REIHENFOLGE, type Paket } from '../lib/pakete'

function PaketAuswahl({ wert, onChange }: { wert: Paket; onChange: (p: Paket) => void }) {
  return (
    <select value={wert} onChange={(e) => onChange(e.target.value as Paket)} className="field-input">
      {PAKET_REIHENFOLGE.map((p) => (
        <option key={p} value={p}>
          {PAKETE[p].label} – bis {PAKETE[p].maxNutzer} Nutzer, {PAKETE[p].speicherGb} GB
          {PAKETE[p].maxAktiveProjekte != null ? `, max. ${PAKETE[p].maxAktiveProjekte} aktive Projekte` : ''}
        </option>
      ))}
    </select>
  )
}

export function PlattformAdmin() {
  const { istPlattformAdmin, unternehmenId: eigeneFirmaId } = useAuth()
  const [firmen, setFirmen] = useState<PlattformUnternehmenUebersicht[]>([])
  const [loading, setLoading] = useState(true)
  const [formOffen, setFormOffen] = useState(false)
  const [firmenname, setFirmenname] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminName, setAdminName] = useState('')
  const [paket, setPaket] = useState<Paket>('team')
  const [maxNutzer, setMaxNutzer] = useState(String(PAKETE.team.maxNutzer))
  const [anlegen, setAnlegen] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [angelegtesPasswort, setAngelegtesPasswort] = useState<{ email: string; passwort: string } | null>(null)
  const [bearbeiteFirma, setBearbeiteFirma] = useState<string | null>(null)
  const [limitEingabe, setLimitEingabe] = useState('')
  const [paketEingabe, setPaketEingabe] = useState<Paket>('team')
  const [limitSpeichert, setLimitSpeichert] = useState(false)
  const [loeschName, setLoeschName] = useState('')
  const [firmaArbeitet, setFirmaArbeitet] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await backend.rpc('plattform_unternehmen_uebersicht')
    if (!error) setFirmen(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (istPlattformAdmin) load()
  }, [istPlattformAdmin])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setAnlegen(true)
    setFehler(null)
    setAngelegtesPasswort(null)
    const { data, error } = await backend.funktion('create-unternehmen', {
      firmenname: firmenname.trim(),
      admin_email: adminEmail.trim(),
      admin_name: adminName.trim(),
      paket,
      max_nutzer: maxNutzer.trim() || null,
    })
    setAnlegen(false)
    if (error) {
      setFehler(funktionsFehler(error) ?? 'Firma konnte nicht angelegt werden.')
      return
    }
    setAngelegtesPasswort({ email: adminEmail.trim(), passwort: data.admin_password })
    setFirmenname('')
    setAdminEmail('')
    setAdminName('')
    setPaket('team')
    setMaxNutzer(String(PAKETE.team.maxNutzer))
    setFormOffen(false)
    load()
  }

  const toggleBearbeiten = (f: PlattformUnternehmenUebersicht) => {
    if (bearbeiteFirma === f.id) {
      setBearbeiteFirma(null)
      return
    }
    setBearbeiteFirma(f.id)
    setLoeschName('')
    setLimitEingabe(f.max_nutzer != null ? String(f.max_nutzer) : '')
    setPaketEingabe(f.paket)
  }

  const handleLimitSpeichern = async (firmaId: string) => {
    setFehler(null)
    const neuerWert = limitEingabe.trim() ? Number(limitEingabe.trim()) : null
    if (neuerWert != null && (!Number.isInteger(neuerWert) || neuerWert < 1)) {
      setFehler('Nutzerlimit muss eine ganze Zahl ab 1 sein (oder leer für unbegrenzt).')
      return
    }
    setLimitSpeichert(true)
    const { error } = await backend.from('unternehmen').update({ paket: paketEingabe, max_nutzer: neuerWert }).eq('id', firmaId)
    setLimitSpeichert(false)
    if (error) {
      setFehler(error.message)
      return
    }
    load()
  }

  const stilllegenUmschalten = async (f: PlattformUnternehmenUebersicht) => {
    const stilllegen = !f.stillgelegt_am
    if (
      stilllegen &&
      !window.confirm(`„${f.name}“ stilllegen? Alle Nutzer dieser Firma werden sofort abgemeldet und können sich nicht mehr anmelden. Die Daten bleiben erhalten.`)
    )
      return
    setFehler(null)
    setFirmaArbeitet(true)
    const { error } = await backend.funktion('unternehmen-stilllegen', { unternehmen_id: f.id, stilllegen })
    setFirmaArbeitet(false)
    if (error) {
      setFehler(funktionsFehler(error) ?? 'Aktion fehlgeschlagen.')
      return
    }
    load()
  }

  const firmaLoeschen = async (f: PlattformUnternehmenUebersicht) => {
    if (!window.confirm(`„${f.name}“ endgültig löschen? Alle Projekte, Pläne, Aufgaben, Dateien und Zugänge dieser Firma werden unwiderruflich entfernt.`)) return
    setFehler(null)
    setFirmaArbeitet(true)
    const { error } = await backend.funktion('unternehmen-loeschen', { unternehmen_id: f.id, bestaetigung: loeschName.trim() })
    setFirmaArbeitet(false)
    if (error) {
      setFehler(funktionsFehler(error) ?? 'Löschen fehlgeschlagen.')
      return
    }
    setBearbeiteFirma(null)
    setLoeschName('')
    load()
  }

  if (!istPlattformAdmin) {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — dieser Bereich ist dem WorkFlow-Betreiber vorbehalten.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Plattform-Verwaltung</h1>
          <p className="text-xs text-text-muted">
            Firmen (Mandanten), die WorkFlow nutzen. Jede Firma ist strikt von den anderen getrennt (eigene Projekte,
            Nutzer, Chats, Dokumente).
          </p>
        </div>
        <button onClick={() => setFormOffen((v) => !v)} className="btn-primary flex-shrink-0">
          {formOffen ? 'Abbrechen' : '+ Firma anlegen'}
        </button>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {angelegtesPasswort && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <p className="font-medium">Firma angelegt. Zugangsdaten für den ersten Admin (nur jetzt sichtbar):</p>
          <p className="mt-1">
            E-Mail: <strong>{angelegtesPasswort.email}</strong>
            <br />
            Passwort: <strong>{angelegtesPasswort.passwort}</strong>
          </p>
          <p className="mt-1 text-xs">Bitte sicher an den Kunden übermitteln — Passwort muss beim ersten Login geändert werden.</p>
        </div>
      )}

      {formOffen && (
        <form onSubmit={handleCreate} className="card mb-6 space-y-3 p-4">
          <div>
            <label className="field-label">Firmenname</label>
            <input
              required
              value={firmenname}
              onChange={(e) => setFirmenname(e.target.value)}
              className="field-input"
              placeholder="z. B. Mustermann GmbH"
            />
          </div>
          <div>
            <label className="field-label">Admin-E-Mail</label>
            <input
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="field-label">Admin-Name</label>
            <input value={adminName} onChange={(e) => setAdminName(e.target.value)} className="field-input" placeholder="Vor- und Nachname" />
          </div>
          <div>
            <label className="field-label">Paket</label>
            <PaketAuswahl
              wert={paket}
              onChange={(p) => {
                setPaket(p)
                setMaxNutzer(String(PAKETE[p].maxNutzer))
              }}
            />
          </div>
          <div>
            <label className="field-label">Max. Nutzer (Standard des Pakets, anpassbar)</label>
            <input
              type="number"
              min={1}
              value={maxNutzer}
              onChange={(e) => setMaxNutzer(e.target.value)}
              className="field-input"
              placeholder="Leer lassen = unbegrenzt"
            />
          </div>
          <p className="text-xs text-text-subtle">
            Ein zufälliges Passwort für den ersten Admin-Account wird automatisch erzeugt und nach dem Anlegen einmalig
            angezeigt.
          </p>
          <button type="submit" disabled={anlegen} className="btn-primary">
            {anlegen ? 'Legt an…' : 'Firma anlegen'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : firmen.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Firmen angelegt.</p>
      ) : (
        <ul className="space-y-2">
          {firmen.map((f) => (
            <li key={f.id} className="card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{f.name}</span>
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-text">
                      {PAKETE[f.paket]?.label ?? f.paket}
                    </span>
                    {f.stillgelegt_am && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/50 dark:text-red-300">
                        Stillgelegt seit {formatDatum(f.stillgelegt_am)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-subtle">Angelegt am {formatDatum(f.erstellt_am)}</div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <div className="text-right text-sm">
                    <div className="font-medium text-text">
                      {f.nutzer_anzahl} {f.max_nutzer != null && <>/ {f.max_nutzer}</>} Nutzer
                    </div>
                    {f.max_nutzer == null && <div className="text-xs text-text-subtle">unbegrenzt</div>}
                  </div>
                  <button onClick={() => toggleBearbeiten(f)} className="btn-secondary text-xs">
                    {bearbeiteFirma === f.id ? 'Schließen' : 'Bearbeiten'}
                  </button>
                </div>
              </div>

              {bearbeiteFirma === f.id && (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  <div className="space-y-2">
                    <label className="field-label">Paket &amp; Nutzerlimit</label>
                    <PaketAuswahl
                      wert={paketEingabe}
                      onChange={(p) => {
                        setPaketEingabe(p)
                        setLimitEingabe(String(PAKETE[p].maxNutzer))
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={limitEingabe}
                        onChange={(e) => setLimitEingabe(e.target.value)}
                        placeholder="Leer lassen = unbegrenzt"
                        className="field-input max-w-[12rem]"
                      />
                      <button
                        onClick={() => handleLimitSpeichern(f.id)}
                        disabled={limitSpeichert}
                        className="btn-primary flex-shrink-0 text-xs"
                      >
                        {limitSpeichert ? 'Speichert…' : 'Paket & Limit speichern'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="field-label">Firmendaten (Adresse, Kontakt, Logo)</label>
                    <UnternehmenForm unternehmenId={f.id} onGespeichert={load} />
                  </div>

                  {f.id === eigeneFirmaId ? (
                    <p className="text-xs text-text-subtle">Die eigene Firma kann nicht stillgelegt oder gelöscht werden.</p>
                  ) : (
                    <div className="space-y-3 rounded-lg border border-red-200 p-3 dark:border-red-900/60">
                      <p className="text-sm font-medium text-red-700 dark:text-red-400">Gefahrenbereich</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => stilllegenUmschalten(f)} disabled={firmaArbeitet} className="btn-secondary text-xs">
                          {f.stillgelegt_am ? 'Firma wieder freigeben' : 'Firma stilllegen'}
                        </button>
                        <span className="text-xs text-text-subtle">
                          {f.stillgelegt_am ? 'Nutzer können sich danach wieder anmelden.' : 'Kein Login mehr möglich, Daten bleiben erhalten.'}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <label className="field-label">Zum endgültigen Löschen den Firmennamen „{f.name}“ eingeben</label>
                        <div className="flex gap-2">
                          <input value={loeschName} onChange={(e) => setLoeschName(e.target.value)} className="field-input" placeholder={f.name} />
                          <button
                            onClick={() => firmaLoeschen(f)}
                            disabled={firmaArbeitet || loeschName.trim() !== f.name.trim()}
                            className="btn-secondary flex-shrink-0 text-xs text-red-600 disabled:opacity-40 dark:text-red-400"
                          >
                            Firma löschen
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
