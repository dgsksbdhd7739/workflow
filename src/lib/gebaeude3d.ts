// Reine Logik fuer die 3D-Gebaeudeansicht (ohne three.js, damit sie im
// Haupt-Bundle bleiben darf): Status je Einheit/Geschoss aus Aufgaben und
// Terminen ableiten und Einheiten im Grundriss eines Geschosses verteilen.
// Fortschritt wird bewusst nicht gespeichert, sondern immer neu berechnet.

import type { Aufgabe, Einheit, Geschoss, Termin } from '../types/database'

export type BereichStatus = 'leer' | 'offen' | 'in_arbeit' | 'fertig' | 'verzug'

export interface BereichAuswertung {
  status: BereichStatus
  aufgabenGesamt: number
  aufgabenErledigt: number
  // 0..1, null wenn keine Aufgaben zugeordnet sind
  fortschritt: number | null
  verzoegerteTermine: number
  naechsterTermin: Termin | null
}

export const STATUS_FARBE: Record<BereichStatus, string> = {
  leer: '#e2e8f0',
  offen: '#fcd34d',
  in_arbeit: '#93c5fd',
  fertig: '#86efac',
  verzug: '#fca5a5',
}

export const STATUS_TEXT: Record<BereichStatus, string> = {
  leer: 'Keine Aufgaben',
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  fertig: 'Fertig',
  verzug: 'Verzug',
}

function heute() {
  return new Date().toISOString().slice(0, 10)
}

/** Termin gilt als verzoegert, wenn so markiert oder Ende ueberschritten und nicht abgeschlossen. */
export function istVerzoegert(t: Termin, stichtag = heute()) {
  return t.status === 'verzoegert' || (t.status !== 'abgeschlossen' && t.end_datum < stichtag)
}

export function auswerten(aufgaben: Aufgabe[], termine: Termin[], stichtag = heute()): BereichAuswertung {
  const erledigt = aufgaben.filter((a) => a.status === 'erledigt').length
  const verzoegert = termine.filter((t) => istVerzoegert(t, stichtag)).length
  const naechster =
    termine
      .filter((t) => t.status !== 'abgeschlossen' && t.end_datum >= stichtag)
      .sort((a, b) => a.start_datum.localeCompare(b.start_datum))[0] ?? null
  let status: BereichStatus
  if (verzoegert > 0) status = 'verzug'
  else if (aufgaben.length === 0) status = naechster?.status === 'laufend' ? 'in_arbeit' : 'leer'
  else if (erledigt === aufgaben.length) status = 'fertig'
  else if (aufgaben.some((a) => a.status === 'in_bearbeitung') || termine.some((t) => t.status === 'laufend')) status = 'in_arbeit'
  else status = 'offen'
  return {
    status,
    aufgabenGesamt: aufgaben.length,
    aufgabenErledigt: erledigt,
    fortschritt: aufgaben.length ? erledigt / aufgaben.length : null,
    verzoegerteTermine: verzoegert,
    naechsterTermin: naechster,
  }
}

export interface GebaeudeAuswertung {
  einheit: Map<string, BereichAuswertung>
  // Geschoss = eigene Zuordnungen + alle seiner Einheiten
  geschoss: Map<string, BereichAuswertung>
  // Gebaeude = alles darunter + direkte Zuordnungen
  gesamt: BereichAuswertung
}

/** Alle Aufgaben/Termine des Gebaeudes auf Einheiten und Geschosse verteilen und auswerten. */
export function gebaeudeAuswerten(
  gebaeudeId: string,
  geschosse: Geschoss[],
  einheiten: Einheit[],
  aufgaben: Aufgabe[],
  termine: Termin[],
): GebaeudeAuswertung {
  const geschossVonEinheit = new Map(einheiten.map((e) => [e.id, e.geschoss_id]))
  const geschossIds = new Set(geschosse.map((g) => g.id))
  const zuGeschoss = <T extends { geschoss_id: string | null; einheit_id: string | null }>(x: T) =>
    x.einheit_id ? geschossVonEinheit.get(x.einheit_id) ?? null : x.geschoss_id
  const imGebaeude = <T extends { gebaeude_id: string | null; geschoss_id: string | null; einheit_id: string | null }>(x: T) =>
    x.gebaeude_id === gebaeudeId || geschossIds.has(zuGeschoss(x) ?? '')

  const einheit = new Map<string, BereichAuswertung>()
  for (const e of einheiten) {
    einheit.set(e.id, auswerten(aufgaben.filter((a) => a.einheit_id === e.id), termine.filter((t) => t.einheit_id === e.id)))
  }
  const geschoss = new Map<string, BereichAuswertung>()
  for (const g of geschosse) {
    geschoss.set(g.id, auswerten(aufgaben.filter((a) => zuGeschoss(a) === g.id), termine.filter((t) => zuGeschoss(t) === g.id)))
  }
  return { einheit, geschoss, gesamt: auswerten(aufgaben.filter(imGebaeude), termine.filter(imGebaeude)) }
}

export interface Rechteck {
  // Mittelpunkt relativ zur Geschossmitte und Groesse, in Metern
  x: number
  z: number
  breite: number
  tiefe: number
}

/**
 * Verteilt n Einheiten im Grundriss: bei mehr als zwei Einheiten zwei Reihen
 * (vorne/hinten, wie Wohnungen an einem Mittelflur), sonst eine. Die Flaeche
 * wird anteilig nach flaeche_m2 vergeben, sofern angegeben.
 */
export function einheitenAufteilen(einheiten: Einheit[], breite: number, tiefe: number, rand = 0.6): Map<string, Rechteck> {
  const sortiert = [...einheiten].sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de', { numeric: true }))
  const reihen = sortiert.length > 2 ? [sortiert.slice(0, Math.ceil(sortiert.length / 2)), sortiert.slice(Math.ceil(sortiert.length / 2))] : [sortiert]
  const ergebnis = new Map<string, Rechteck>()
  const nutzTiefe = tiefe - rand * 2
  const reihenTiefe = nutzTiefe / reihen.length
  reihen.forEach((reihe, r) => {
    const gewichte = reihe.map((e) => e.flaeche_m2 ?? 1)
    const summe = gewichte.reduce((s, w) => s + w, 0)
    let links = -breite / 2 + rand
    const nutzBreite = breite - rand * 2
    reihe.forEach((e, i) => {
      const b = (nutzBreite * gewichte[i]) / summe
      ergebnis.set(e.id, {
        x: links + b / 2,
        z: -nutzTiefe / 2 + reihenTiefe * (r + 0.5),
        breite: Math.max(b - 0.3, 0.5),
        tiefe: Math.max(reihenTiefe - 0.3, 0.5),
      })
      links += b
    })
  })
  return ergebnis
}

/** Standardnamen fuer den Geschoss-Assistenten: UG 2, UG 1, EG, OG 1 ... */
export function geschossName(ebene: number, untergeschosse: number) {
  if (ebene < 0) return untergeschosse > 1 ? `UG ${-ebene}` : 'UG'
  if (ebene === 0) return 'EG'
  return `OG ${ebene}`
}
