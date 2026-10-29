import type { FastifyInstance } from 'fastify'
import type { Datenbank, Verbindung } from '../datenbank.ts'
import type { Konfiguration } from '../konfiguration.ts'
import { AnfrageFehler, erfordertAnmeldung, nutzerVon } from '../anfrage.ts'
import { hashePasswort, passwortFehler, pruefePasswort } from './passwort.ts'
import { erstelleMfaToken, pruefeMfaToken } from './token.ts'
import { neuesTotpGeheimnis, pruefeTotp, totpEinrichtungsdaten } from './totp.ts'
import {
  type AbmeldeBereich,
  sitzungAufAal2,
  sitzungErneuern,
  sitzungStarten,
  sitzungenBeenden,
} from './sitzungen.ts'

const FALSCHE_ANMELDEDATEN = 'E-Mail-Adresse oder Passwort ist falsch.'

function text(body: unknown, feld: string): string {
  const wert = (body as Record<string, unknown> | null)?.[feld]
  if (typeof wert !== 'string' || !wert.trim()) throw new AnfrageFehler(400, `Feld "${feld}" fehlt.`)
  return wert
}

interface Faktor {
  id: string
  friendly_name: string | null
  factor_type: 'totp'
  status: 'unverified' | 'verified'
  secret: string
  letzter_zeitschritt: string | null
  created_at: string
  updated_at: string
}

async function faktorenVon(v: Verbindung, userId: string) {
  const { rows } = await v.query<Faktor>(
    'select * from auth.mfa_factors where user_id = $1 order by created_at',
    [userId],
  )
  return rows
}

// Oeffentliche Form eines Faktors (ohne Geheimnis), Feldnamen wie bisher.
function faktorOeffentlich(f: Faktor) {
  return {
    id: f.id,
    friendly_name: f.friendly_name,
    factor_type: f.factor_type,
    status: f.status,
    created_at: f.created_at,
    updated_at: f.updated_at,
  }
}

/** Prueft den Code gegen den Faktor und merkt sich den Zeitschritt (Einmalverwendung). */
async function codeVerbrauchen(v: Verbindung, faktor: Faktor, code: unknown) {
  const letzter = faktor.letzter_zeitschritt === null ? null : Number(faktor.letzter_zeitschritt)
  const schritt = pruefeTotp(code, faktor.secret, letzter)
  if (schritt === null) throw new AnfrageFehler(400, 'Der Code ist falsch oder abgelaufen.', 'code_falsch')
  await v.query('update auth.mfa_factors set letzter_zeitschritt = $2, updated_at = now() where id = $1', [
    faktor.id,
    schritt,
  ])
}

export function authRouten(app: FastifyInstance, db: Datenbank, konf: Konfiguration) {
  const angemeldet = erfordertAnmeldung(db, konf)
  const begrenzt = { config: { rateLimit: { max: konf.anmeldeVersucheProMinute, timeWindow: '1 minute' } } }

  // Schritt 1 der Anmeldung. Mit eingerichtetem zweiten Faktor gibt es hier
  // noch KEINE Sitzung, nur ein 5-Minuten-Zwischentoken fuer /mfa.
  app.post('/api/auth/anmelden', begrenzt, async (req) => {
    const email = text(req.body, 'email').trim()
    const passwort = text(req.body, 'passwort')
    return db.alsDienst(async (v) => {
      const { rows } = await v.query<{ id: string; email: string; encrypted_password: string | null; gesperrt: boolean }>(
        `select id, email, encrypted_password, coalesce(banned_until > now(), false) as gesperrt
           from auth.users where lower(email) = lower($1)`,
        [email],
      )
      const user = rows[0]
      if (!(await pruefePasswort(passwort, user?.encrypted_password))) {
        throw new AnfrageFehler(400, FALSCHE_ANMELDEDATEN, 'anmeldedaten_falsch')
      }
      if (user.gesperrt) throw new AnfrageFehler(403, 'Dieses Konto ist deaktiviert.', 'konto_gesperrt')

      const faktoren = (await faktorenVon(v, user.id)).filter((f) => f.status === 'verified')
      if (faktoren.length > 0) {
        return {
          mfa_erforderlich: true,
          mfa_token: await erstelleMfaToken(user.id, konf.jwtGeheimnis),
          faktor_id: faktoren[0].id,
        }
      }
      return sitzungStarten(v, konf, { id: user.id, email: user.email }, 'aal1', req.headers['user-agent'])
    })
  })

  // Schritt 2 bei aktivem 2FA: Zwischentoken + Code -> Sitzung mit aal2.
  app.post('/api/auth/mfa', begrenzt, async (req) => {
    let userId: string
    try {
      userId = await pruefeMfaToken(text(req.body, 'mfa_token'), konf.jwtGeheimnis)
    } catch {
      throw new AnfrageFehler(401, 'Die Anmeldung ist abgelaufen. Bitte erneut anmelden.', 'mfa_token_ungueltig')
    }
    return db.alsDienst(async (v) => {
      const { rows } = await v.query<{ email: string; gesperrt: boolean }>(
        'select email, coalesce(banned_until > now(), false) as gesperrt from auth.users where id = $1',
        [userId],
      )
      if (!rows[0] || rows[0].gesperrt) throw new AnfrageFehler(403, 'Dieses Konto ist deaktiviert.', 'konto_gesperrt')
      const faktor = (await faktorenVon(v, userId)).find((f) => f.status === 'verified')
      if (!faktor) throw new AnfrageFehler(400, 'Kein zweiter Faktor eingerichtet.')
      await codeVerbrauchen(v, faktor, (req.body as { code?: unknown }).code)
      return sitzungStarten(v, konf, { id: userId, email: rows[0].email }, 'aal2', req.headers['user-agent'])
    })
  })

  app.post('/api/auth/erneuern', begrenzt, async (req) => {
    const refreshToken = text(req.body, 'refresh_token')
    const sitzung = await db.alsDienst((v) => sitzungErneuern(v, konf, refreshToken))
    if (!sitzung) throw new AnfrageFehler(401, 'Sitzung beendet. Bitte erneut anmelden.', 'sitzung_beendet')
    return sitzung
  })

  app.post('/api/auth/abmelden', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    const bereich = ((req.body as { bereich?: string } | null)?.bereich ?? 'lokal') as AbmeldeBereich
    if (!['lokal', 'andere', 'alle'].includes(bereich)) throw new AnfrageFehler(400, 'Unbekannter Abmelde-Bereich.')
    await db.alsDienst((v) => sitzungenBeenden(v, nutzer.sub, bereich, nutzer.session_id))
    return { ok: true }
  })

  app.get('/api/auth/nutzer', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    return db.alsDienst(async (v) => {
      const faktoren = await faktorenVon(v, nutzer.sub)
      return {
        id: nutzer.sub,
        email: nutzer.email,
        aal: nutzer.aal,
        faktoren: faktoren.map(faktorOeffentlich),
      }
    })
  })

  // Passwort aendern beendet alle anderen Sitzungen (z. B. nach Verdacht auf
  // fremden Zugriff oder bei der Pflicht-Aenderung nach Erstanmeldung).
  app.post('/api/auth/passwort', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    const passwort = (req.body as { passwort?: unknown } | null)?.passwort
    const fehler = passwortFehler(passwort)
    if (fehler) throw new AnfrageFehler(400, fehler)
    const hash = await hashePasswort(passwort as string)
    await db.alsDienst(async (v) => {
      await v.query('update auth.users set encrypted_password = $2, updated_at = now() where id = $1', [nutzer.sub, hash])
      await sitzungenBeenden(v, nutzer.sub, 'andere', nutzer.session_id)
    })
    return { ok: true }
  })

  app.post('/api/auth/email', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    const email = text(req.body, 'email').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AnfrageFehler(400, 'Bitte eine gültige E-Mail-Adresse eingeben.')
    await db.alsDienst(async (v) => {
      const { rowCount } = await v.query('select 1 from auth.users where lower(email) = lower($1) and id <> $2', [
        email,
        nutzer.sub,
      ])
      if (rowCount) throw new AnfrageFehler(409, 'Diese E-Mail-Adresse wird bereits verwendet.')
      await v.query('update auth.users set email = $2, updated_at = now() where id = $1', [nutzer.sub, email])
    })
    return { ok: true, email }
  })

  // 2FA einrichten: legt einen unbestaetigten Faktor an (abgebrochene
  // Einrichtungen werden dabei aufgeraeumt) und liefert QR-Code + Geheimnis.
  app.post('/api/auth/mfa/faktoren', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    return db.alsDienst(async (v) => {
      const vorhandene = await faktorenVon(v, nutzer.sub)
      if (vorhandene.some((f) => f.status === 'verified')) {
        throw new AnfrageFehler(409, 'Die Zwei-Faktor-Anmeldung ist bereits eingerichtet.')
      }
      await v.query("delete from auth.mfa_factors where user_id = $1 and status = 'unverified'", [nutzer.sub])
      const geheimnis = neuesTotpGeheimnis()
      const { rows } = await v.query<Faktor>(
        `insert into auth.mfa_factors (user_id, friendly_name, secret) values ($1, $2, $3) returning *`,
        [nutzer.sub, 'Authenticator', geheimnis],
      )
      const { uri, qr_code } = await totpEinrichtungsdaten(geheimnis, nutzer.email)
      return { ...faktorOeffentlich(rows[0]), totp: { secret: geheimnis, uri, qr_code } }
    })
  })

  // Einrichtung bestaetigen: Faktor aktiv, diese Sitzung wird aal2, alle
  // anderen Sitzungen enden (die muessen sich kuenftig mit Code anmelden).
  app.post<{ Params: { id: string } }>('/api/auth/mfa/faktoren/:id/bestaetigen', { preHandler: angemeldet, ...begrenzt }, async (req) => {
    const nutzer = nutzerVon(req)
    return db.alsDienst(async (v) => {
      const faktor = (await faktorenVon(v, nutzer.sub)).find((f) => f.id === req.params.id)
      if (!faktor) throw new AnfrageFehler(404, 'Faktor nicht gefunden.')
      await codeVerbrauchen(v, faktor, (req.body as { code?: unknown } | null)?.code)
      await v.query("update auth.mfa_factors set status = 'verified', updated_at = now() where id = $1", [faktor.id])
      await sitzungenBeenden(v, nutzer.sub, 'andere', nutzer.session_id)
      return sitzungAufAal2(v, konf, nutzer.session_id, { id: nutzer.sub, email: nutzer.email })
    })
  })

  // Aktiven Faktor entfernen nur mit 2FA-bestaetigter Sitzung.
  app.delete<{ Params: { id: string } }>('/api/auth/mfa/faktoren/:id', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    await db.alsDienst(async (v) => {
      const faktor = (await faktorenVon(v, nutzer.sub)).find((f) => f.id === req.params.id)
      if (!faktor) throw new AnfrageFehler(404, 'Faktor nicht gefunden.')
      if (faktor.status === 'verified' && nutzer.aal !== 'aal2') {
        throw new AnfrageFehler(403, 'Zum Entfernen bitte zuerst mit Code anmelden.', 'aal2_erforderlich')
      }
      await v.query('delete from auth.mfa_factors where id = $1', [faktor.id])
    })
    return { ok: true }
  })
}
