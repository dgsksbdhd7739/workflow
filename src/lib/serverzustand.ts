// Antwort von GET /api/betrieb/serverzustand (server/src/betrieb/routen.ts)
// und Hilfen zur Anzeige auf der Seite Serverzustand.

export interface Messpunkt {
  zeit: string
  cpu: number
  cpu_max: number
  ram: number
  platte: number
  netz_rein: number | null
  netz_raus: number | null
}

export interface Serverzustand {
  erfasst_am: string
  server: {
    kerne: number
    cpu_prozent: number
    last: number[]
    ram_belegt: number
    ram_gesamt: number
    platte_belegt: number
    platte_gesamt: number
    laufzeit_s: number
    backend_laufzeit_s: number
    backend_ram: number
    node_version: string
  }
  dienste: { name: string; label: string; zustand: string }[] | null
  sicherung: {
    zuletzt_am: string | null
    ok: boolean | null
    db_bytes: number | null
    dateien_bytes: number | null
    naechste_am: string | null
  }
  zertifikat_laeuft_ab_am: string | null
  speicher: { datenbank_bytes: number; dateien_bytes: number; dateien_anzahl: number }
  nutzung: { firmen: number; nutzer: number; sitzungen: number; aktiv_letzte_stunde: number }
  fehler_24h: number
  raster_sekunden: number
  verlauf: Messpunkt[]
}

export type Ampel = 'gut' | 'warnung' | 'kritisch'

/** Bewertung einer Auslastung in Prozent: ab 75 % Warnung, ab 90 % kritisch. */
export function ampelFuerProzent(prozent: number, warnung = 75, kritisch = 90): Ampel {
  if (prozent >= kritisch) return 'kritisch'
  if (prozent >= warnung) return 'warnung'
  return 'gut'
}

export const AMPEL_TEXT: Record<Ampel, string> = { gut: 'In Ordnung', warnung: 'Erhöht', kritisch: 'Kritisch' }

export function bytesText(bytes: number | null | undefined, stellen = 1) {
  if (bytes == null) return '–'
  const einheiten = ['B', 'KB', 'MB', 'GB', 'TB']
  let wert = bytes
  let i = 0
  while (wert >= 1024 && i < einheiten.length - 1) {
    wert /= 1024
    i++
  }
  return `${wert.toLocaleString('de-DE', { maximumFractionDigits: i === 0 ? 0 : stellen })} ${einheiten[i]}`
}

export function dauerText(sekunden: number) {
  const tage = Math.floor(sekunden / 86400)
  const stunden = Math.floor((sekunden % 86400) / 3600)
  const minuten = Math.floor((sekunden % 3600) / 60)
  if (tage > 0) return `${tage} T ${stunden} Std`
  if (stunden > 0) return `${stunden} Std ${minuten} Min`
  return `${minuten} Min`
}

export function prozent(teil: number, ganz: number) {
  return ganz > 0 ? (teil / ganz) * 100 : 0
}
