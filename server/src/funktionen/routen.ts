import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Datenbank, Verbindung } from '../datenbank.ts'
import type { Konfiguration } from '../konfiguration.ts'
import { AnfrageFehler, erfordertAnmeldung, nutzerVon } from '../anfrage.ts'
import { hashePasswort, passwortFehler } from '../auth/passwort.ts'
import { sitzungenBeenden } from '../auth/sitzungen.ts'
import { pgFehlerAlsAntwort } from '../daten/routen.ts'

// Nachfolger der Supabase-Edge-Functions create-user, create-unternehmen,
// delete-user, reset-user-password und set-user-active. Antwortformate sind
// unveraendert. Neu gegenueber damals: Ziel-Nutzer muessen zur Firma des
// aufrufenden Admins gehoeren (vorher war per Nutzer-ID auch ein fremder
// Nutzer erreichbar), und jede Funktion laeuft in einer Transaktion.

const ROLLEN = ['admin', 'planer', 'techniker', 'kunde']
const PAKET_NUTZER: Record<string, number> = { starter: 5, team: 15, business: 30 }

type Koerper = Record<string, unknown> | undefined

function textFeld(body: Koerper, feld: string) {
  const wert = body?.[feld]
  return typeof wert === 'string' ? wert.trim() : ''
}

interface Aufrufer {
  id: string
  role: string
  unternehmen_id: string
}

async function aufruferProfil(v: Verbindung, userId: string): Promise<Aufrufer> {
  const { rows } = await v.query<Aufrufer>('select id, role, unternehmen_id from public.profiles where id = $1', [userId])
  if (!rows[0]) throw new AnfrageFehler(403, 'Kein Profil gefunden.')
  return rows[0]
}

async function nurAdmin(v: Verbindung, userId: string, meldung: string) {
  const ich = await aufruferProfil(v, userId)
  if (ich.role !== 'admin') throw new AnfrageFehler(403, meldung)
  return ich
}

/** Ziel-Nutzer muss in derselben Firma sein; sonst wie "nicht vorhanden" behandeln. */
async function nutzerDerFirma(v: Verbindung, zielId: string, unternehmenId: string) {
  const { rowCount } = await v.query('select 1 from public.profiles where id = $1 and unternehmen_id = $2', [
    zielId,
    unternehmenId,
  ])
  if (!rowCount) throw new AnfrageFehler(404, 'Nutzer nicht gefunden.')
}

async function emailFrei(v: Verbindung, email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AnfrageFehler(400, 'Bitte eine gültige E-Mail-Adresse eingeben.')
  const { rowCount } = await v.query('select 1 from auth.users where lower(email) = lower($1)', [email])
  if (rowCount) throw new AnfrageFehler(409, 'Ein Nutzer mit dieser E-Mail-Adresse existiert bereits.')
}

/** Legt den Login an; das Profil entsteht per handle_new_user() in der angegebenen Firma. */
async function loginAnlegen(v: Verbindung, email: string, passwort: string, unternehmenId: string, name: string) {
  const { rows } = await v.query<{ id: string }>(
    `insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3) returning id`,
    [email, await hashePasswort(passwort), { ...(name ? { full_name: name } : {}), unternehmen_id: unternehmenId }],
  )
  return rows[0].id
}

export function funktionsRouten(app: FastifyInstance, db: Datenbank, konf: Konfiguration) {
  const angemeldet = erfordertAnmeldung(db, konf)

  async function ausfuehren<T>(arbeit: (v: Verbindung) => Promise<T>): Promise<T> {
    try {
      return await db.alsDienst(arbeit)
    } catch (fehler) {
      throw pgFehlerAlsAntwort(fehler) ?? fehler
    }
  }

  app.post<{ Body: Koerper }>('/api/funktionen/create-user', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    const email = textFeld(req.body, 'email')
    const passwort = typeof req.body?.password === 'string' ? req.body.password : ''
    const name = textFeld(req.body, 'full_name')
    const rolle = textFeld(req.body, 'role') || 'techniker'
    if (!email || !passwort) throw new AnfrageFehler(400, 'E-Mail und Passwort sind erforderlich.')
    const pwFehler = passwortFehler(passwort)
    if (pwFehler) throw new AnfrageFehler(400, pwFehler)
    if (!ROLLEN.includes(rolle)) throw new AnfrageFehler(400, 'Ungültige Rolle.')

    return ausfuehren(async (v) => {
      const ich = await nurAdmin(v, nutzer.sub, 'Nur Admins dürfen Nutzer anlegen.')
      const { rows } = await v.query<{ max_nutzer: number | null; paket: string }>(
        'select max_nutzer, paket from public.unternehmen where id = $1 for update',
        [ich.unternehmen_id],
      )
      const firma = rows[0]
      if (rolle === 'kunde' && firma?.paket === 'starter') {
        throw new AnfrageFehler(403, 'Kunden-Zugänge sind erst ab dem Team-Paket verfügbar.')
      }
      if (firma?.max_nutzer != null) {
        // Zaehlt ohne Plattform-Admins (Migration 0058), die belegen kein Limit.
        const { rows: anzahl } = await v.query<{ n: number }>('select public.unternehmen_nutzer_anzahl($1)::int as n', [
          ich.unternehmen_id,
        ])
        if (anzahl[0].n >= firma.max_nutzer) {
          throw new AnfrageFehler(403, `Nutzerlimit erreicht (maximal ${firma.max_nutzer} Nutzer für dieses Unternehmen).`)
        }
      }
      await emailFrei(v, email)
      const id = await loginAnlegen(v, email, passwort, ich.unternehmen_id, name)
      if (rolle !== 'techniker') await v.query('update public.profiles set role = $2 where id = $1', [id, rolle])
      return { id }
    })
  })

  app.post<{ Body: Koerper }>('/api/funktionen/delete-user', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    const zielId = textFeld(req.body, 'user_id')
    if (!zielId) throw new AnfrageFehler(400, 'user_id ist erforderlich.')
    if (zielId === nutzer.sub) throw new AnfrageFehler(400, 'Du kannst dich nicht selbst löschen.')
    try {
      return await db.alsDienst(async (v) => {
        const ich = await nurAdmin(v, nutzer.sub, 'Nur Admins dürfen Nutzer löschen.')
        await nutzerDerFirma(v, zielId, ich.unternehmen_id)
        await v.query('delete from auth.users where id = $1', [zielId])
        return { ok: true }
      })
    } catch (fehler) {
      if ((fehler as { code?: string }).code === '23503') {
        throw new AnfrageFehler(
          409,
          'Nutzer kann nicht gelöscht werden, da noch Datensätze (Pläne, Aufgaben, Zeiterfassung o. Ä.) mit ihm verknüpft sind. Bitte stattdessen deaktivieren.',
        )
      }
      throw pgFehlerAlsAntwort(fehler) ?? fehler
    }
  })

  app.post<{ Body: Koerper }>('/api/funktionen/reset-user-password', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    const zielId = textFeld(req.body, 'user_id')
    const passwort = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!zielId || !passwort) throw new AnfrageFehler(400, 'user_id und password sind erforderlich.')
    const pwFehler = passwortFehler(passwort)
    if (pwFehler) throw new AnfrageFehler(400, pwFehler)
    const hash = await hashePasswort(passwort)
    return ausfuehren(async (v) => {
      const ich = await nurAdmin(v, nutzer.sub, 'Nur Admins dürfen Passwörter zurücksetzen.')
      await nutzerDerFirma(v, zielId, ich.unternehmen_id)
      await v.query('update auth.users set encrypted_password = $2, updated_at = now() where id = $1', [zielId, hash])
      // Vom Admin vergebenes Passwort muss beim naechsten Login geaendert werden.
      await v.query('update public.profiles set muss_passwort_aendern = true where id = $1', [zielId])
      // Wer das alte Passwort kannte, ist damit sofort draussen.
      if (zielId !== nutzer.sub) await sitzungenBeenden(v, zielId, 'alle')
      return { ok: true }
    })
  })

  app.post<{ Body: Koerper }>('/api/funktionen/set-user-active', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    const zielId = textFeld(req.body, 'user_id')
    const aktiv = req.body?.aktiv === true
    if (!zielId) throw new AnfrageFehler(400, 'user_id ist erforderlich.')
    if (zielId === nutzer.sub && !aktiv) throw new AnfrageFehler(400, 'Du kannst dich nicht selbst deaktivieren.')
    return ausfuehren(async (v) => {
      const ich = await nurAdmin(v, nutzer.sub, 'Nur Admins dürfen Nutzer deaktivieren.')
      await nutzerDerFirma(v, zielId, ich.unternehmen_id)
      await v.query(
        `update auth.users set banned_until = case when $2 then null else 'infinity'::timestamptz end, updated_at = now()
          where id = $1`,
        [zielId, aktiv],
      )
      await v.query('update public.profiles set deaktiviert = $2 where id = $1', [zielId, !aktiv])
      if (!aktiv) await sitzungenBeenden(v, zielId, 'alle')
      return { ok: true }
    })
  })

  // Neue Firma samt erstem Admin: von Plattform-Admins (UI) oder per
  // PROVISION_SECRET (scripts/create-unternehmen.mjs, ohne Login).
  app.post<{ Body: Koerper }>('/api/funktionen/create-unternehmen', async (req: FastifyRequest<{ Body: Koerper }>) => {
    const geheimnis = req.headers['x-provision-secret']
    let perGeheimnis = false
    if (typeof geheimnis === 'string' && konf.provisionGeheimnis) {
      const a = Buffer.from(geheimnis)
      const b = Buffer.from(konf.provisionGeheimnis)
      perGeheimnis = a.length === b.length && timingSafeEqual(a, b)
    }
    let aufruferId: string | null = null
    if (!perGeheimnis) {
      await angemeldet(req, undefined as never)
      aufruferId = nutzerVon(req).sub
    }

    const firmenname = textFeld(req.body, 'firmenname')
    const adminEmail = textFeld(req.body, 'admin_email')
    const adminName = textFeld(req.body, 'admin_name')
    const paket = textFeld(req.body, 'paket') || 'team'
    if (!(paket in PAKET_NUTZER)) throw new AnfrageFehler(400, 'paket muss starter, team oder business sein.')
    const roh = req.body?.max_nutzer
    const maxNutzer = roh != null && roh !== '' ? Number(roh) : PAKET_NUTZER[paket]
    // Ohne mitgegebenes Passwort wird eines erzeugt (Plattform-Admin-UI fragt keins ab).
    const adminPasswort =
      typeof req.body?.admin_password === 'string' && req.body.admin_password
        ? req.body.admin_password
        : randomBytes(10).toString('base64url').slice(0, 14)
    if (!firmenname) throw new AnfrageFehler(400, 'firmenname fehlt.')
    if (!adminEmail) throw new AnfrageFehler(400, 'admin_email fehlt.')
    const pwFehler = passwortFehler(adminPasswort)
    if (pwFehler) throw new AnfrageFehler(400, pwFehler)
    if (!Number.isInteger(maxNutzer) || maxNutzer < 1) throw new AnfrageFehler(400, 'max_nutzer muss eine positive ganze Zahl sein.')

    return ausfuehren(async (v) => {
      if (aufruferId) {
        const { rowCount } = await v.query('select 1 from public.plattform_admins where user_id = $1', [aufruferId])
        if (!rowCount) throw new AnfrageFehler(401, 'Nicht autorisiert.')
      }
      await emailFrei(v, adminEmail)
      const { rows } = await v.query<{ id: string }>(
        'insert into public.unternehmen (name, paket, max_nutzer) values ($1, $2, $3) returning id',
        [firmenname, paket, maxNutzer],
      )
      const unternehmenId = rows[0].id
      const adminId = await loginAnlegen(v, adminEmail, adminPasswort, unternehmenId, adminName)
      await v.query("update public.profiles set role = 'admin' where id = $1", [adminId])
      return { unternehmen_id: unternehmenId, admin_user_id: adminId, admin_password: adminPasswort }
    })
  })
}
