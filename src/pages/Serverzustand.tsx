import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { backend } from '../lib/backend'
import { useAuth } from '../contexts/AuthContext'
import { VerlaufDiagramm, type Serie } from '../components/VerlaufDiagramm'
import {
  AMPEL_TEXT,
  type Ampel,
  type Serverzustand as Zustand,
  ampelFuerProzent,
  bytesText,
  dauerText,
  prozent,
} from '../lib/serverzustand'

type Zeitraum = '24h' | '7d'

// Farben je Bedeutung; Ampel immer zusammen mit Symbol und Text, nie nur Farbe.
const AMPEL_STIL: Record<Ampel, { balken: string; text: string; Symbol: typeof CheckCircle2 }> = {
  gut: { balken: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', Symbol: CheckCircle2 },
  warnung: { balken: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', Symbol: AlertTriangle },
  kritisch: { balken: 'bg-red-500', text: 'text-red-700 dark:text-red-400', Symbol: XCircle },
}

// Geprueft mit dem Paletten-Validator (hell gegen #ffffff, dunkel gegen #131a2b).
const SERIE_A = { linie: 'stroke-[#4f46e5] dark:stroke-[#7c7ff5]', punkt: 'fill-[#4f46e5] bg-[#4f46e5] dark:fill-[#7c7ff5] dark:bg-[#7c7ff5]' }
const SERIE_B = { linie: 'stroke-[#0d9488] dark:stroke-[#0d9f91]', punkt: 'fill-[#0d9488] bg-[#0d9488] dark:fill-[#0d9f91] dark:bg-[#0d9f91]' }
const FLAECHE = 'fill-[#4f46e5]/10 dark:fill-[#7c7ff5]/15'

const prozentText = (w: number) => `${w.toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`

function AmpelHinweis({ ampel, text }: { ampel: Ampel; text?: string }) {
  const { text: farbe, Symbol } = AMPEL_STIL[ampel]
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${farbe}`}>
      <Symbol className="h-3.5 w-3.5" aria-hidden />
      {text ?? AMPEL_TEXT[ampel]}
    </span>
  )
}

function Anzeige({ titel, wert, details, ampel }: { titel: string; wert: number; details: ReactNode; ampel: Ampel }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-muted">{titel}</span>
        <AmpelHinweis ampel={ampel} />
      </div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-text">{prozentText(wert)}</div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-hover"
        role="meter"
        aria-label={titel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(wert)}
      >
        <div className={`h-full rounded-full ${AMPEL_STIL[ampel].balken}`} style={{ width: `${Math.min(Math.max(wert, 1), 100)}%` }} />
      </div>
      <div className="mt-2 text-xs text-text-muted">{details}</div>
    </div>
  )
}

function Kachel({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-text">{titel}</h3>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  )
}

function Zeile({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-muted">{name}</dt>
      <dd className="text-right font-medium tabular-nums text-text">{children}</dd>
    </div>
  )
}

const zeitpunkt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'

/** Probleme, die oben gesammelt angezeigt werden. */
function hinweiseErmitteln(z: Zustand) {
  const liste: { ampel: Ampel; text: string }[] = []
  for (const d of z.dienste ?? []) {
    if (d.zustand !== 'active') liste.push({ ampel: 'kritisch', text: `${d.label} läuft nicht (${d.zustand}).` })
  }
  const platte = prozent(z.server.platte_belegt, z.server.platte_gesamt)
  if (platte >= 75) liste.push({ ampel: ampelFuerProzent(platte), text: `Festplatte zu ${Math.round(platte)} % belegt.` })
  const ram = prozent(z.server.ram_belegt, z.server.ram_gesamt)
  if (ram >= 75) liste.push({ ampel: ampelFuerProzent(ram), text: `Arbeitsspeicher zu ${Math.round(ram)} % belegt.` })
  if (z.sicherung.ok === false) liste.push({ ampel: 'kritisch', text: 'Die letzte nächtliche Sicherung ist fehlgeschlagen.' })
  else if (z.sicherung.zuletzt_am && Date.now() - Date.parse(z.sicherung.zuletzt_am) > 36 * 3600_000) {
    liste.push({ ampel: 'warnung', text: 'Die letzte Sicherung ist älter als 36 Stunden.' })
  }
  if (z.zertifikat_laeuft_ab_am) {
    const tage = (Date.parse(z.zertifikat_laeuft_ab_am) - Date.now()) / 86400_000
    if (tage < 14) liste.push({ ampel: tage < 5 ? 'kritisch' : 'warnung', text: `HTTPS-Zertifikat läuft in ${Math.floor(tage)} Tagen ab.` })
  }
  if (z.fehler_24h > 0) liste.push({ ampel: 'warnung', text: `${z.fehler_24h} Serverfehler in den letzten 24 Stunden.` })
  return liste
}

export function Serverzustand() {
  const { istPlattformAdmin } = useAuth()
  const [zeitraum, setZeitraum] = useState<Zeitraum>('24h')
  const [zustand, setZustand] = useState<Zustand | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)

  const laden = useCallback(async () => {
    setLaedt(true)
    const { data, error } = await backend.serverzustand(zeitraum)
    setLaedt(false)
    if (error) {
      setFehler(error.message)
      return
    }
    setFehler(null)
    setZustand(data)
  }, [zeitraum])

  useEffect(() => {
    if (!istPlattformAdmin) return
    laden()
    const zeitgeber = setInterval(() => {
      if (document.visibilityState === 'visible') laden()
    }, 60_000)
    return () => clearInterval(zeitgeber)
  }, [istPlattformAdmin, laden])

  const verlauf = useMemo(() => {
    if (!zustand) return null
    const bis = Date.parse(zustand.erfasst_am)
    const von = bis - (zeitraum === '7d' ? 7 * 86400_000 : 86400_000)
    const raster = zustand.raster_sekunden
    const punkte = zustand.verlauf.map((p) => ({ ...p, ms: Date.parse(p.zeit) }))
    const reihe = (werte: (p: (typeof punkte)[number]) => (number | null)[]) => punkte.map((p) => ({ zeit: p.ms, werte: werte(p) }))
    return {
      von,
      bis,
      rasterMs: raster * 1000,
      cpu: reihe((p) => [p.cpu]),
      ram: reihe((p) => [p.ram]),
      platte: reihe((p) => [p.platte]),
      // Bytes je Rasterfeld -> durchschnittliche Rate pro Sekunde
      netz: reihe((p) => [p.netz_rein != null ? p.netz_rein / raster : null, p.netz_raus != null ? p.netz_raus / raster : null]),
      tabelle: punkte,
    }
  }, [zustand, zeitraum])

  if (!istPlattformAdmin) {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — dieser Bereich ist dem WorkFlow-Betreiber vorbehalten.</p>
      </div>
    )
  }

  const s = zustand?.server
  const hinweise = zustand ? hinweiseErmitteln(zustand) : []
  const einzel: Serie[] = [{ name: 'Wert', ...SERIE_A, flaeche: FLAECHE }]

  return (
    <div className="page">
      <Link to="/plattform-admin" className="mb-2 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text">
        <ArrowLeft className="h-3.5 w-3.5" /> Plattform-Verwaltung
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Serverzustand</h1>
          <p className="text-xs text-text-muted">
            STRATO-Server mit Backend, Datenbank und Dateien. {zustand && <>Stand {zeitpunkt(zustand.erfasst_am)}, aktualisiert sich jede Minute.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Zeitraum">
            {(['24h', '7d'] as const).map((z) => (
              <button
                key={z}
                onClick={() => setZeitraum(z)}
                aria-pressed={zeitraum === z}
                className={`rounded-md px-3 py-1 ${zeitraum === z ? 'bg-brand-soft font-medium text-brand-text' : 'text-text-muted hover:text-text'}`}
              >
                {z === '24h' ? '24 Stunden' : '7 Tage'}
              </button>
            ))}
          </div>
          <button onClick={laden} disabled={laedt} className="btn-secondary text-xs" aria-label="Aktualisieren">
            <RefreshCw className={`h-3.5 w-3.5 ${laedt ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}
      {!zustand || !s || !verlauf ? (
        !fehler && <p className="text-sm text-text-muted">Lädt…</p>
      ) : (
        <div className="space-y-4">
          <div className="card p-4">
            {hinweise.length === 0 ? (
              <AmpelHinweis ampel="gut" text="Alles in Ordnung — alle Dienste laufen, Sicherung und Zertifikat sind aktuell." />
            ) : (
              <ul className="space-y-1">
                {hinweise.map((h) => (
                  <li key={h.text}>
                    <AmpelHinweis ampel={h.ampel} text={h.text} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Anzeige
              titel="Prozessor (CPU)"
              wert={s.cpu_prozent}
              ampel={ampelFuerProzent(s.cpu_prozent)}
              details={
                <>
                  {s.kerne} Kerne · Last {s.last.map((l) => l.toLocaleString('de-DE')).join(' / ')}
                </>
              }
            />
            <Anzeige
              titel="Arbeitsspeicher (RAM)"
              wert={prozent(s.ram_belegt, s.ram_gesamt)}
              ampel={ampelFuerProzent(prozent(s.ram_belegt, s.ram_gesamt))}
              details={
                <>
                  {bytesText(s.ram_belegt)} von {bytesText(s.ram_gesamt)} belegt
                </>
              }
            />
            <Anzeige
              titel="Festplatte"
              wert={prozent(s.platte_belegt, s.platte_gesamt)}
              ampel={ampelFuerProzent(prozent(s.platte_belegt, s.platte_gesamt))}
              details={
                <>
                  {bytesText(s.platte_belegt)} von {bytesText(s.platte_gesamt, 0)} belegt
                </>
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <VerlaufDiagramm titel="CPU-Auslastung" serien={einzel} punkte={verlauf.cpu} rasterMs={verlauf.rasterMs} vonMs={verlauf.von} bisMs={verlauf.bis} yMax={100} formatY={prozentText} />
            <VerlaufDiagramm titel="Arbeitsspeicher" serien={einzel} punkte={verlauf.ram} rasterMs={verlauf.rasterMs} vonMs={verlauf.von} bisMs={verlauf.bis} yMax={100} formatY={prozentText} />
            <VerlaufDiagramm
              titel="Netzwerk"
              serien={[
                { name: 'Empfangen', ...SERIE_A },
                { name: 'Gesendet', ...SERIE_B },
              ]}
              punkte={verlauf.netz}
              rasterMs={verlauf.rasterMs}
              vonMs={verlauf.von}
              bisMs={verlauf.bis}
              formatY={(w) => `${bytesText(w, 0)}/s`}
            />
            <VerlaufDiagramm titel="Festplatte" serien={einzel} punkte={verlauf.platte} rasterMs={verlauf.rasterMs} vonMs={verlauf.von} bisMs={verlauf.bis} yMax={100} formatY={prozentText} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Kachel titel="Dienste">
              {zustand.dienste ? (
                zustand.dienste.map((d) => (
                  <Zeile key={d.name} name={d.label}>
                    <AmpelHinweis ampel={d.zustand === 'active' ? 'gut' : 'kritisch'} text={d.zustand === 'active' ? 'läuft' : d.zustand} />
                  </Zeile>
                ))
              ) : (
                <p className="text-xs text-text-subtle">Nicht abrufbar.</p>
              )}
            </Kachel>
            <Kachel titel="Nächtliche Sicherung">
              <Zeile name="Zuletzt">{zeitpunkt(zustand.sicherung.zuletzt_am)}</Zeile>
              <Zeile name="Ergebnis">
                {zustand.sicherung.ok == null ? (
                  '–'
                ) : (
                  <AmpelHinweis ampel={zustand.sicherung.ok ? 'gut' : 'kritisch'} text={zustand.sicherung.ok ? 'erfolgreich' : 'fehlgeschlagen'} />
                )}
              </Zeile>
              <Zeile name="Datenbank / Dateien">
                {bytesText(zustand.sicherung.db_bytes)} / {bytesText(zustand.sicherung.dateien_bytes)}
              </Zeile>
              <Zeile name="Nächste">{zeitpunkt(zustand.sicherung.naechste_am)}</Zeile>
              <p className="pt-1 text-xs text-text-subtle">Liegt auf demselben Server, 14 Tage aufbewahrt.</p>
            </Kachel>
            <Kachel titel="Speicher der App">
              <Zeile name="Datenbank">{bytesText(zustand.speicher.datenbank_bytes)}</Zeile>
              <Zeile name="Hochgeladene Dateien">{bytesText(zustand.speicher.dateien_bytes)}</Zeile>
              <Zeile name="Anzahl Dateien">{zustand.speicher.dateien_anzahl.toLocaleString('de-DE')}</Zeile>
            </Kachel>
            <Kachel titel="Nutzung">
              <Zeile name="Firmen">{zustand.nutzung.firmen}</Zeile>
              <Zeile name="Nutzer">{zustand.nutzung.nutzer}</Zeile>
              <Zeile name="Angemeldete Geräte">{zustand.nutzung.sitzungen}</Zeile>
              <Zeile name="Aktiv in der letzten Stunde">{zustand.nutzung.aktiv_letzte_stunde}</Zeile>
            </Kachel>
            <Kachel titel="Sicherheit">
              <Zeile name="HTTPS-Zertifikat gültig bis">{zeitpunkt(zustand.zertifikat_laeuft_ab_am)}</Zeile>
              <Zeile name="Serverfehler (24 Std)">{zustand.fehler_24h}</Zeile>
            </Kachel>
            <Kachel titel="Laufzeit">
              <Zeile name="Server läuft seit">{dauerText(s.laufzeit_s)}</Zeile>
              <Zeile name="Backend läuft seit">{dauerText(s.backend_laufzeit_s)}</Zeile>
              <Zeile name="Backend-Speicher">{bytesText(s.backend_ram)}</Zeile>
              <Zeile name="Node.js">{s.node_version}</Zeile>
            </Kachel>
          </div>

          <details className="card p-4 text-sm">
            <summary className="cursor-pointer font-medium text-text">Verlauf als Tabelle</summary>
            <div className="mt-3 max-h-72 overflow-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="sticky top-0 bg-surface text-left text-text-muted">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Zeit</th>
                    <th className="py-1 pr-3 text-right font-medium">CPU Ø / max</th>
                    <th className="py-1 pr-3 text-right font-medium">RAM</th>
                    <th className="py-1 pr-3 text-right font-medium">Festplatte</th>
                    <th className="py-1 pr-3 text-right font-medium">Empfangen</th>
                    <th className="py-1 text-right font-medium">Gesendet</th>
                  </tr>
                </thead>
                <tbody className="text-text">
                  {[...verlauf.tabelle].reverse().map((p) => (
                    <tr key={p.zeit} className="border-t border-border">
                      <td className="py-1 pr-3">{zeitpunkt(p.zeit)}</td>
                      <td className="py-1 pr-3 text-right">
                        {prozentText(p.cpu)} / {prozentText(p.cpu_max)}
                      </td>
                      <td className="py-1 pr-3 text-right">{prozentText(p.ram)}</td>
                      <td className="py-1 pr-3 text-right">{prozentText(p.platte)}</td>
                      <td className="py-1 pr-3 text-right">{bytesText(p.netz_rein)}</td>
                      <td className="py-1 text-right">{bytesText(p.netz_raus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
