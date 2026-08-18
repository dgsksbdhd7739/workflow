import type { Baustelle, Unternehmen } from '../types/database'

export function formatProjektAdresse(b: Baustelle): string | null {
  const zeile1 = [b.projekt_strasse, b.projekt_hausnummer].filter(Boolean).join(' ')
  const zeile2 = [b.projekt_plz, b.projekt_stadt].filter(Boolean).join(' ')
  const formatiert = [zeile1, zeile2].filter(Boolean).join(', ')
  return formatiert || b.adresse
}

export function kartenUrl(adresse: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`
}

export function formatKundenAdresse(b: Baustelle): string | null {
  const zeile1 = [b.kunden_strasse, b.kunden_hausnummer].filter(Boolean).join(' ')
  const zeile2 = [b.kunden_plz, b.kunden_stadt].filter(Boolean).join(' ')
  const formatiert = [zeile1, zeile2].filter(Boolean).join(', ')
  return formatiert || null
}

export function formatUnternehmenAdresse(u: Unternehmen): string | null {
  const zeile1 = [u.strasse, u.hausnummer].filter(Boolean).join(' ')
  const zeile2 = [u.plz, u.stadt].filter(Boolean).join(' ')
  const formatiert = [zeile1, zeile2].filter(Boolean).join(', ')
  return formatiert || null
}
