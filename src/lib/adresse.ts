import type { Baustelle } from '../types/database'

export function formatProjektAdresse(b: Baustelle): string | null {
  const zeile1 = [b.projekt_strasse, b.projekt_hausnummer].filter(Boolean).join(' ')
  const zeile2 = [b.projekt_plz, b.projekt_stadt].filter(Boolean).join(' ')
  const formatiert = [zeile1, zeile2].filter(Boolean).join(', ')
  return formatiert || b.adresse
}
