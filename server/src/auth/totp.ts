import { authenticator } from 'otplib'
import QRCode from 'qrcode'

// Standard-TOTP (30 s, 6 Stellen, SHA1) wie bei Supabase -- bestehende
// Authenticator-App-Eintraege funktionieren ohne Neueinrichtung weiter.
// window 1 toleriert einen Zeitschritt Uhrabweichung in beide Richtungen.
authenticator.options = { window: 1 }

const AUSSTELLER = 'WorkFlow'

export function neuesTotpGeheimnis() {
  return authenticator.generateSecret(20)
}

export async function totpEinrichtungsdaten(geheimnis: string, email: string) {
  const uri = authenticator.keyuri(email, AUSSTELLER, geheimnis)
  const svg = await QRCode.toString(uri, { type: 'svg', margin: 1 })
  return { uri, qr_code: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }
}

/**
 * Prueft einen Code und liefert den verwendeten 30-s-Zeitschritt, oder null.
 * Ist der Schritt nicht neuer als letzterSchritt, wird der Code abgelehnt
 * (verhindert das erneute Verwenden eines abgefangenen Codes).
 */
export function pruefeTotp(code: unknown, geheimnis: string, letzterSchritt: number | null): number | null {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return null
  const abweichung = authenticator.checkDelta(code.trim(), geheimnis)
  if (abweichung === null) return null
  const schritt = Math.floor(Date.now() / 30_000) + abweichung
  if (letzterSchritt !== null && schritt <= letzterSchritt) return null
  return schritt
}
