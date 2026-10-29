import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Claims, Datenbank } from './datenbank.ts'
import type { Konfiguration } from './konfiguration.ts'
import { pruefeZugriffstoken } from './auth/token.ts'
import { sitzungIstAktiv } from './auth/sitzungen.ts'

declare module 'fastify' {
  interface FastifyRequest {
    // Gesetzt durch erfordertAnmeldung; in geschuetzten Routen immer vorhanden.
    nutzer?: Claims
  }
}

/** Fehler mit HTTP-Status und deutscher, fuer Nutzer gedachter Meldung. */
export class AnfrageFehler extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, meldung: string, code?: string) {
    super(meldung)
    this.status = status
    this.code = code
  }
}

export function nutzerVon(req: FastifyRequest): Claims {
  if (!req.nutzer) throw new AnfrageFehler(401, 'Nicht angemeldet.')
  return req.nutzer
}

/**
 * preHandler fuer geschuetzte Routen: Zugriffstoken pruefen und zusaetzlich
 * in der DB nachsehen, ob die Sitzung noch laeuft und das Konto nicht
 * gesperrt ist -- so wirken Abmelden auf anderen Geraeten und Deaktivieren
 * sofort, nicht erst nach Ablauf des Tokens.
 */
export function erfordertAnmeldung(db: Datenbank, konf: Konfiguration) {
  return async (req: FastifyRequest, _antwort: FastifyReply) => {
    const kopf = req.headers.authorization
    if (!kopf?.startsWith('Bearer ')) throw new AnfrageFehler(401, 'Nicht angemeldet.')
    let claims: Claims
    try {
      claims = await pruefeZugriffstoken(kopf.slice(7), konf.jwtGeheimnis)
    } catch {
      throw new AnfrageFehler(401, 'Sitzung abgelaufen. Bitte erneut anmelden.', 'token_ungueltig')
    }
    const aktiv = await db.alsDienst((v) => sitzungIstAktiv(v, claims.session_id, claims.sub))
    if (!aktiv) throw new AnfrageFehler(401, 'Sitzung beendet. Bitte erneut anmelden.', 'sitzung_beendet')
    req.nutzer = claims
  }
}
