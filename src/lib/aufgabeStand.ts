import type { Aufgabe, AufgabeStatus, StatusVorlageWert } from '../types/database'

const statusLabel: Record<AufgabeStatus, string> = {
  offen: 'Stopp',
  in_bearbeitung: 'In Arbeit',
  erledigt: 'Abgeschlossen',
}

export function standVonAufgabe(m: Aufgabe, werteMap: Record<string, StatusVorlageWert>): string {
  if (m.status_wert_id) {
    const wert = werteMap[m.status_wert_id]
    if (wert) return wert.titel
  }
  return statusLabel[m.status]
}
