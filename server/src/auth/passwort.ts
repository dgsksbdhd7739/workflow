import bcrypt from 'bcryptjs'

// Uebernommene Supabase-Hashes sind bcrypt ($2a$10$...) und bleiben gueltig.
const KOSTEN = 12
export const MIN_PASSWORT_LAENGE = 6

// Fester Hash fuer unbekannte E-Mail-Adressen, damit die Antwortzeit nicht
// verraet, ob ein Konto existiert.
const BLIND_HASH = bcrypt.hashSync('workflow-unbekanntes-konto', KOSTEN)

export function hashePasswort(passwort: string) {
  return bcrypt.hash(passwort, KOSTEN)
}

export async function pruefePasswort(passwort: string, hash: string | null | undefined) {
  if (!hash) {
    await bcrypt.compare(passwort, BLIND_HASH)
    return false
  }
  return bcrypt.compare(passwort, hash)
}

export function passwortFehler(passwort: unknown): string | null {
  if (typeof passwort !== 'string' || passwort.length < MIN_PASSWORT_LAENGE) {
    return `Das Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen haben.`
  }
  if (Buffer.byteLength(passwort, 'utf8') > 72) {
    // bcrypt beruecksichtigt nur die ersten 72 Bytes (Umlaute zaehlen doppelt).
    return 'Das Passwort ist zu lang (hoechstens 72 Bytes, ca. 70 Zeichen).'
  }
  return null
}
