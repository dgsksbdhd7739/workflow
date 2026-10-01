// Pakete je Firma -- muss mit paket_erlaubt_fuer() in Migration 0059
// uebereinstimmen (die Datenbank setzt die Sperren serverseitig durch,
// diese Datei steuert nur die Anzeige). Enterprise bewusst noch nicht.

export type Paket = 'starter' | 'team' | 'business'

export type PaketFunktion =
  | 'projekt_chat'
  | 'dokumente'
  | 'termine'
  | 'material'
  | 'vorlagen'
  | 'kunden'
  | 'modulsperren'

interface PaketInfo {
  label: string
  maxNutzer: number
  maxAktiveProjekte: number | null
  speicherGb: number
  funktionen: PaketFunktion[]
}

const TEAM_FUNKTIONEN: PaketFunktion[] = ['projekt_chat', 'dokumente', 'termine', 'material', 'vorlagen', 'kunden']

export const PAKETE: Record<Paket, PaketInfo> = {
  starter: { label: 'Starter', maxNutzer: 5, maxAktiveProjekte: 5, speicherGb: 5, funktionen: [] },
  team: { label: 'Team', maxNutzer: 15, maxAktiveProjekte: null, speicherGb: 20, funktionen: TEAM_FUNKTIONEN },
  business: { label: 'Business', maxNutzer: 30, maxAktiveProjekte: null, speicherGb: 50, funktionen: [...TEAM_FUNKTIONEN, 'modulsperren'] },
}

export const PAKET_REIHENFOLGE: Paket[] = ['starter', 'team', 'business']

export function paketErlaubt(paket: Paket | null, funktion: PaketFunktion): boolean {
  // Unbekanntes Paket (noch nicht geladen) nicht sperren -- der Server prueft ohnehin.
  if (!paket) return true
  return PAKETE[paket].funktionen.includes(funktion)
}

export function mindestPaket(funktion: PaketFunktion): Paket {
  return PAKET_REIHENFOLGE.find((p) => PAKETE[p].funktionen.includes(funktion)) ?? 'business'
}

export const FUNKTION_LABEL: Record<PaketFunktion, string> = {
  projekt_chat: 'Projekt-Chat',
  dokumente: 'Dokumente',
  termine: 'Termine',
  material: 'Material & Materialstamm',
  vorlagen: 'Eigene Vorlagen',
  kunden: 'Kunden-Zugänge',
  modulsperren: 'Modul-Sperren pro Nutzer',
}
