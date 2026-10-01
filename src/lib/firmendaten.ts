import type { Unternehmen } from '../types/database'

// Pflichtangaben, die ein Firmen-Admin bei der Erstanmeldung (nach dem
// Passwortwechsel) hinterlegen muss, bevor er die App nutzen kann -- sie
// erscheinen u. a. im Kopf jedes PDF-Exports. Website bleibt optional.
export const FIRMENDATEN_PFLICHT = [
  'name',
  'strasse',
  'hausnummer',
  'plz',
  'stadt',
  'land',
  'telefon',
  'email',
  'logo_pfad',
] as const satisfies readonly (keyof Unternehmen)[]

export type FirmendatenPflicht = Pick<Unternehmen, (typeof FIRMENDATEN_PFLICHT)[number]>

export function firmendatenVollstaendig(u: Partial<FirmendatenPflicht> | null | undefined): boolean {
  if (!u) return false
  return FIRMENDATEN_PFLICHT.every((feld) => (u[feld] ?? '').trim() !== '')
}
