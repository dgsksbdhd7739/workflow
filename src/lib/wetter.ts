// Automatischer Wetterabruf fuer Tagesberichte ueber Open-Meteo
// (kostenlos, kein API-Key noetig). Geocodiert den Projektort und liest
// dann Tageswerte fuer das gewuenschte Datum: Forecast-API deckt die
// letzten Tage bis 16 Tage voraus ab, die Archive-API weiter zurueckliegende
// Daten.
import type { Baustelle } from '../types/database'

const wetterCodeLabel: Record<number, string> = {
  0: 'Klarer Himmel',
  1: 'Überwiegend klar',
  2: 'Teilweise bewölkt',
  3: 'Bedeckt',
  45: 'Nebel',
  48: 'Reifnebel',
  51: 'Leichter Nieselregen',
  53: 'Nieselregen',
  55: 'Starker Nieselregen',
  56: 'Gefrierender Nieselregen',
  57: 'Starker gefrierender Nieselregen',
  61: 'Leichter Regen',
  63: 'Regen',
  65: 'Starker Regen',
  66: 'Gefrierender Regen',
  67: 'Starker gefrierender Regen',
  71: 'Leichter Schneefall',
  73: 'Schneefall',
  75: 'Starker Schneefall',
  77: 'Schneegriesel',
  80: 'Leichte Regenschauer',
  81: 'Regenschauer',
  82: 'Starke Regenschauer',
  85: 'Leichter Schneeschauer',
  86: 'Starker Schneeschauer',
  95: 'Gewitter',
  96: 'Gewitter mit leichtem Hagel',
  99: 'Gewitter mit starkem Hagel',
}

function wetterBeschreibung(code: number): string {
  return wetterCodeLabel[code] ?? 'Unbekannt'
}

async function geocode(ort: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ort)}&count=1&language=de&format=json`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const treffer = data?.results?.[0]
  if (!treffer) return null
  return { lat: treffer.latitude, lon: treffer.longitude }
}

async function tageswerte(lat: number, lon: number, datum: string): Promise<{ code: number; max: number; min: number } | null> {
  const params = `latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${datum}&end_date=${datum}`
  for (const basis of ['https://api.open-meteo.com/v1/forecast', 'https://archive-api.open-meteo.com/v1/archive']) {
    try {
      const res = await fetch(`${basis}?${params}`)
      if (!res.ok) continue
      const data = await res.json()
      const code = data?.daily?.weathercode?.[0]
      const max = data?.daily?.temperature_2m_max?.[0]
      const min = data?.daily?.temperature_2m_min?.[0]
      if (code !== undefined && max !== undefined && min !== undefined) {
        return { code, max, min }
      }
    } catch {
      // naechste Quelle versuchen
    }
  }
  return null
}

// Open-Meteo Geocoding ist eine Ortsnamen-Suche, keine strukturierte
// Adresssuche: PLZ oder Land mit in die Suchzeichenkette zu mischen liefert
// oft keine Treffer. Der Stadtname allein ist das zuverlaessigste Signal.
export function projektOrt(baustelle: Baustelle): string | null {
  return baustelle.projekt_stadt || baustelle.projekt_land || null
}

export async function holeWetterFuerBaustelle(
  baustelle: Baustelle,
  datum: string,
): Promise<{ wetter: string; temperatur: number } | null> {
  const ort = projektOrt(baustelle)
  if (!ort) return null
  const koordinaten = await geocode(ort)
  if (!koordinaten) return null
  const werte = await tageswerte(koordinaten.lat, koordinaten.lon, datum)
  if (!werte) return null
  const mittel = Math.round((werte.max + werte.min) / 2)
  return { wetter: wetterBeschreibung(werte.code), temperatur: mittel }
}
