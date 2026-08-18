import type { Mangel, MangelStatus, StatusVorlageWert } from '../types/database'

const statusLabel: Record<MangelStatus, string> = {
  offen: 'Stopp',
  in_bearbeitung: 'In Arbeit',
  erledigt: 'Abgeschlossen',
}

export function standVonMangel(m: Mangel, werteMap: Record<string, StatusVorlageWert>): string {
  if (m.status_wert_id) {
    const wert = werteMap[m.status_wert_id]
    if (wert) return wert.titel
  }
  return statusLabel[m.status]
}
