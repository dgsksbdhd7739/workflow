import type { Projekt, Tagesbericht } from '../types/database'

// Fortlaufende Nummer je Bericht innerhalb eines Projekts, nach Datum
// (bei gleichem Datum nach Erstellzeit) aufsteigend vergeben -- unabhaengig
// von der Anzeige-Reihenfolge (neueste zuerst), damit die Nummer stabil
// bleibt und nicht von der aktuellen Sortierung abhaengt.
export function tagesberichtNummern(berichte: Tagesbericht[]): Record<string, number> {
  const sortiert = [...berichte].sort(
    (a, b) => a.datum.localeCompare(b.datum) || a.erstellt_am.localeCompare(b.erstellt_am),
  )
  const map: Record<string, number> = {}
  sortiert.forEach((b, i) => {
    map[b.id] = i + 1
  })
  return map
}

export function tagesberichtName(projekt: Projekt, bericht: Tagesbericht, nummer: number): string {
  const projektname = projekt.name.trim().replace(/\s+/g, '_')
  return `TB_${projektname}_${nummer}_${bericht.datum}`
}
