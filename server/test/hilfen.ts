import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import { baueApp } from '../src/app.ts'
import { Datenbank } from '../src/datenbank.ts'
import type { Konfiguration } from '../src/konfiguration.ts'

// Tests laufen gegen eine eigene, per server/scripts/migrieren.sh aufgebaute
// Datenbank (lokal ueber SSH-Tunnel, siehe npm run tunnel) -- nie gegen die
// Produktivdatenbank, denn sie wird hier geleert.
const url = process.env.TEST_DATABASE_URL
if (!url || !/\/workflow_test(\?|$)/.test(url)) {
  throw new Error('TEST_DATABASE_URL fehlt oder zeigt nicht auf die Datenbank workflow_test.')
}

export const PASSWORT = 'richtig-geheim'

export function testKonfiguration(anpassung: Partial<Konfiguration> = {}): Konfiguration {
  return {
    datenbankUrl: url!,
    jwtGeheimnis: new TextEncoder().encode(randomBytes(32).toString('hex')),
    port: 0,
    erlaubteUrspruenge: [],
    zugriffstokenSekunden: 3600,
    sitzungInaktivTage: 90,
    anmeldeVersucheProMinute: 1000,
    dateienVerzeichnis: mkdtempSync(path.join(tmpdir(), 'workflow-dateien-')),
    maxUploadBytes: 5 * 1024 * 1024,
    provisionGeheimnis: null,
    firebaseDienstkontoDatei: null,
    ...anpassung,
  }
}

export async function testUmgebung(anpassung: Partial<Konfiguration> = {}) {
  process.env.NODE_ENV = 'test'
  const konf = testKonfiguration(anpassung)
  const db = new Datenbank(konf.datenbankUrl)
  const app = await baueApp(db, konf)
  return {
    app,
    db,
    konf,
    async beenden() {
      await app.close()
      await db.schliessen()
    },
  }
}

export async function datenbankLeeren(db: Datenbank) {
  // cascade leert alle Tabellen, die (indirekt) auf Nutzer oder Firmen verweisen.
  await db.alsDienst((v) => v.query('truncate auth.users, public.unternehmen, storage.objects cascade'))
}

/** Legt eine Firma mit einem Nutzer an (Profil entsteht per handle_new_user-Trigger). */
export async function firmaMitNutzer(
  db: Datenbank,
  name: string,
  optionen: { kosten?: number; rolle?: string; gesperrt?: boolean } = {},
) {
  return db.alsDienst(async (v) => {
    const { rows: firma } = await v.query<{ id: string }>('insert into public.unternehmen (name) values ($1) returning id', [name])
    const email = `${name.toLowerCase().replace(/\W+/g, '-')}-${randomBytes(3).toString('hex')}@test.example`
    const hash = bcrypt.hashSync(PASSWORT, optionen.kosten ?? 4)
    const { rows: user } = await v.query<{ id: string }>(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data, banned_until)
       values ($1, $2, $3, $4) returning id`,
      [email, hash, { unternehmen_id: firma[0].id, full_name: name }, optionen.gesperrt ? '2999-01-01' : null],
    )
    if (optionen.rolle) {
      await v.query('update public.profiles set role = $2 where id = $1', [user[0].id, optionen.rolle])
    }
    return { unternehmenId: firma[0].id, userId: user[0].id, email }
  })
}

/** TOTP-Code fuer jetzt bzw. einen spaeteren Zeitschritt (Einmalverwendung im Test umgehen). */
export function totpCode(geheimnis: string, schritteVoraus = 0) {
  return authenticator.clone({ epoch: Date.now() + schritteVoraus * 30_000 }).generate(geheimnis)
}

export function bearer(token: string) {
  return { authorization: `Bearer ${token}` }
}
