// Einheitliche Datumsdarstellung im gesamten Projekt: TT.MM.JJJJ.
// Nimmt ISO-Strings von Postgres date-/timestamptz-Spalten (z. B.
// "2026-08-15" oder "2026-08-15T10:30:00+00:00") entgegen.
export function formatDatum(iso: string | null | undefined): string {
  if (!iso) return ''
  const [jahr, monat, tag] = iso.slice(0, 10).split('-')
  if (!jahr || !monat || !tag) return iso
  return `${tag}.${monat}.${jahr}`
}
