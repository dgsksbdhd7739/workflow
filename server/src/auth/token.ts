import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { Claims } from '../datenbank.ts'

// typ trennt die beiden Token-Arten, damit ein Zwischen-Token aus der
// 2FA-Anmeldung nie als Zugriffstoken durchgeht.
type TokenTyp = 'zugriff' | 'mfa'

export async function erstelleZugriffstoken(claims: Claims, geheimnis: Uint8Array, sekunden: number) {
  return new SignJWT({ ...claims, typ: 'zugriff' satisfies TokenTyp })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${sekunden}s`)
    .sign(geheimnis)
}

export async function pruefeZugriffstoken(token: string, geheimnis: Uint8Array): Promise<Claims> {
  const { payload } = await jwtVerify(token, geheimnis, { algorithms: ['HS256'] })
  if (
    payload.typ !== 'zugriff' ||
    typeof payload.sub !== 'string' ||
    typeof payload.session_id !== 'string' ||
    typeof payload.email !== 'string' ||
    (payload.aal !== 'aal1' && payload.aal !== 'aal2')
  ) {
    throw new Error('Ungueltiges Zugriffstoken')
  }
  return {
    sub: payload.sub,
    role: 'authenticated',
    email: payload.email,
    aal: payload.aal,
    session_id: payload.session_id,
  }
}

// Kurzlebiges Zwischen-Token nach korrektem Passwort, solange der zweite
// Faktor noch aussteht. Gibt keinerlei Datenzugriff.
export async function erstelleMfaToken(userId: string, geheimnis: Uint8Array) {
  return new SignJWT({ typ: 'mfa' satisfies TokenTyp })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(geheimnis)
}

export async function pruefeMfaToken(token: string, geheimnis: Uint8Array): Promise<string> {
  const { payload } = await jwtVerify(token, geheimnis, { algorithms: ['HS256'] })
  if (payload.typ !== 'mfa' || typeof payload.sub !== 'string') throw new Error('Ungueltiges MFA-Token')
  return payload.sub
}

// Refresh-Tokens sind zufaellig (nicht JWT); in der DB steht nur ihr Hash.
export function neuesRefreshToken() {
  return randomBytes(32).toString('base64url')
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
