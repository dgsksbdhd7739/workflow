import type { Claims, Verbindung } from '../datenbank.ts'
import type { Konfiguration } from '../konfiguration.ts'
import { erstelleZugriffstoken, hashRefreshToken, neuesRefreshToken } from './token.ts'

// Alle Funktionen hier erwarten eine Verbindung als service_role
// (Datenbank.alsDienst), weil auth.* fuer Nutzer gesperrt ist.

export interface SitzungsAntwort {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  expires_at: number
  user: { id: string; email: string }
  aal: 'aal1' | 'aal2'
}

const KULANZ_SEKUNDEN = 30

async function tokensAusstellen(
  konf: Konfiguration,
  sitzungId: string,
  user: { id: string; email: string },
  aal: 'aal1' | 'aal2',
  refreshToken: string,
): Promise<SitzungsAntwort> {
  const claims: Claims = { sub: user.id, role: 'authenticated', email: user.email, aal, session_id: sitzungId }
  const access_token = await erstelleZugriffstoken(claims, konf.jwtGeheimnis, konf.zugriffstokenSekunden)
  return {
    access_token,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: konf.zugriffstokenSekunden,
    expires_at: Math.floor(Date.now() / 1000) + konf.zugriffstokenSekunden,
    user,
    aal,
  }
}

export async function sitzungStarten(
  v: Verbindung,
  konf: Konfiguration,
  user: { id: string; email: string },
  aal: 'aal1' | 'aal2',
  userAgent: string | undefined,
): Promise<SitzungsAntwort> {
  const refreshToken = neuesRefreshToken()
  const { rows } = await v.query<{ id: string }>(
    `insert into auth.sitzungen (user_id, refresh_token_hash, aal, laeuft_ab_am, user_agent)
     values ($1, $2, $3, now() + make_interval(days => $4), $5)
     returning id`,
    [user.id, hashRefreshToken(refreshToken), aal, konf.sitzungInaktivTage, userAgent?.slice(0, 300) ?? null],
  )
  await v.query('update auth.users set last_sign_in_at = now() where id = $1', [user.id])
  return tokensAusstellen(konf, rows[0].id, user, aal, refreshToken)
}

/**
 * Tauscht ein Refresh-Token gegen ein neues Paar (Rotation). Der Vorgaenger
 * bleibt KULANZ_SEKUNDEN gueltig, damit doppelte Erneuerungen bei schlechtem
 * Netz ein Geraet nicht abmelden. Gesperrte Konten erhalten nichts mehr.
 */
export async function sitzungErneuern(
  v: Verbindung,
  konf: Konfiguration,
  refreshToken: string,
): Promise<SitzungsAntwort | null> {
  const hash = hashRefreshToken(refreshToken)
  const { rows } = await v.query<{ id: string; aal: 'aal1' | 'aal2'; user_id: string; email: string }>(
    `select s.id, s.aal, u.id as user_id, u.email
       from auth.sitzungen s
       join auth.users u on u.id = s.user_id
      where (s.refresh_token_hash = $1
             or (s.vorheriger_refresh_token_hash = $1
                 and s.zuletzt_erneuert_am > now() - make_interval(secs => $2)))
        and s.beendet_am is null
        and s.laeuft_ab_am > now()
        and (u.banned_until is null or u.banned_until <= now())
        and not public.firma_stillgelegt(u.id)
      for update of s`,
    [hash, KULANZ_SEKUNDEN],
  )
  const s = rows[0]
  if (!s) return null
  const neues = neuesRefreshToken()
  await v.query(
    `update auth.sitzungen
        set vorheriger_refresh_token_hash = refresh_token_hash,
            refresh_token_hash = $2,
            zuletzt_erneuert_am = now(),
            laeuft_ab_am = now() + make_interval(days => $3)
      where id = $1`,
    [s.id, hashRefreshToken(neues), konf.sitzungInaktivTage],
  )
  return tokensAusstellen(konf, s.id, { id: s.user_id, email: s.email }, s.aal, neues)
}

/** Hebt eine Sitzung nach erfolgreichem zweiten Faktor auf aal2 und rotiert ihr Refresh-Token. */
export async function sitzungAufAal2(
  v: Verbindung,
  konf: Konfiguration,
  sitzungId: string,
  user: { id: string; email: string },
): Promise<SitzungsAntwort> {
  const neues = neuesRefreshToken()
  await v.query(
    `update auth.sitzungen
        set aal = 'aal2', refresh_token_hash = $2, vorheriger_refresh_token_hash = null,
            zuletzt_erneuert_am = now()
      where id = $1`,
    [sitzungId, hashRefreshToken(neues)],
  )
  return tokensAusstellen(konf, sitzungId, user, 'aal2', neues)
}

export async function sitzungIstAktiv(v: Verbindung, sitzungId: string, userId: string) {
  const { rowCount } = await v.query(
    `select 1
       from auth.sitzungen s
       join auth.users u on u.id = s.user_id
      where s.id = $1 and s.user_id = $2
        and s.beendet_am is null and s.laeuft_ab_am > now()
        and (u.banned_until is null or u.banned_until <= now())
        and not public.firma_stillgelegt(u.id)`,
    [sitzungId, userId],
  )
  return rowCount === 1
}

export type AbmeldeBereich = 'lokal' | 'andere' | 'alle'

export async function sitzungenBeenden(v: Verbindung, userId: string, bereich: AbmeldeBereich, eigeneSitzungId?: string) {
  if (bereich === 'lokal') {
    await v.query('update auth.sitzungen set beendet_am = now() where id = $1 and beendet_am is null', [eigeneSitzungId])
  } else if (bereich === 'andere') {
    await v.query(
      'update auth.sitzungen set beendet_am = now() where user_id = $1 and id <> $2 and beendet_am is null',
      [userId, eigeneSitzungId],
    )
  } else {
    await v.query('update auth.sitzungen set beendet_am = now() where user_id = $1 and beendet_am is null', [userId])
  }
}
