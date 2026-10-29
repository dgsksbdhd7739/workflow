import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { Messung } from '../src/betrieb/messung.ts'
import { PASSWORT, bearer, datenbankLeeren, firmaMitNutzer, testUmgebung } from './hilfen.ts'

const u = await testUmgebung()
after(() => u.beenden())
beforeEach(async () => {
  await datenbankLeeren(u.db)
  await u.db.alsDienst((v) => v.query('delete from betrieb.messwerte'))
})

async function anmelden(name: string, plattformAdmin = false) {
  const n = await firmaMitNutzer(u.db, name, { rolle: 'admin' })
  if (plattformAdmin) await u.db.alsDienst((v) => v.query('insert into public.plattform_admins (user_id) values ($1)', [n.userId]))
  const r = await u.app.inject({ method: 'POST', url: '/api/auth/anmelden', payload: { email: n.email, passwort: PASSWORT } })
  return r.json().access_token as string
}

const zustand = (token?: string, zeitraum = '24h') =>
  u.app.inject({ method: 'GET', url: `/api/betrieb/serverzustand?zeitraum=${zeitraum}`, headers: token ? bearer(token) : {} })

test('Serverzustand nur fuer Plattform-Admins', async () => {
  assert.equal((await zustand()).statusCode, 401)
  const firmenAdmin = await anmelden('Firma A')
  assert.equal((await zustand(firmenAdmin)).statusCode, 403)
})

test('Serverzustand liefert aktuelle Werte und den Verlauf der Messungen', async () => {
  const token = await anmelden('Betreiber', true)
  const messung = new Messung(u.db, u.app.log, u.konf.dateienVerzeichnis)
  await messung.erfassen()
  await messung.erfassen()

  for (const zeitraum of ['24h', '7d']) {
    const r = await zustand(token, zeitraum)
    assert.equal(r.statusCode, 200, r.body)
    const d = r.json()
    assert.ok(d.server.kerne >= 1)
    assert.ok(d.server.cpu_prozent >= 0 && d.server.cpu_prozent <= 100)
    assert.ok(d.server.ram_belegt > 0 && d.server.ram_belegt <= d.server.ram_gesamt)
    assert.ok(d.server.platte_gesamt > 0)
    assert.equal(typeof d.speicher.datenbank_bytes, 'number')
    assert.equal(d.nutzung.firmen, 1)
    assert.equal(d.nutzung.nutzer, 1)
    assert.equal(d.verlauf.length, 1)
    assert.equal(typeof d.verlauf[0].cpu, 'number')
    assert.ok(d.verlauf[0].ram > 0)
  }
})

test('Messwerte sind nicht ueber die Daten-Schnittstelle erreichbar', async () => {
  const token = await anmelden('Betreiber', true)
  const r = await u.app.inject({
    method: 'POST',
    url: '/api/daten/messwerte',
    headers: bearer(token),
    payload: { aktion: 'select' },
  })
  assert.equal(r.statusCode, 404)
})
