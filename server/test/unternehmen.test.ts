import { after, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { PASSWORT, bearer, datenbankLeeren, firmaMitNutzer, testUmgebung } from './hilfen.ts'

const u = await testUmgebung()
after(() => u.beenden())
beforeEach(() => datenbankLeeren(u.db))

async function anmelden(email: string) {
  return u.app.inject({ method: 'POST', url: '/api/auth/anmelden', payload: { email, passwort: PASSWORT } })
}

async function angemeldet(name: string, plattformAdmin = false) {
  const n = await firmaMitNutzer(u.db, name, { rolle: 'admin' })
  if (plattformAdmin) await u.db.alsDienst((v) => v.query('insert into public.plattform_admins (user_id) values ($1)', [n.userId]))
  const token = (await anmelden(n.email)).json().access_token as string
  const funktion = (name: string, body: object) =>
    u.app.inject({ method: 'POST', url: `/api/funktionen/${name}`, headers: bearer(token), payload: body })
  const daten = (tabelle: string, abfrage: object) =>
    u.app.inject({ method: 'POST', url: `/api/daten/${tabelle}`, headers: bearer(token), payload: abfrage })
  return { ...n, token, funktion, daten }
}

/** Firma B mit Projekt, Aufgabe (von B angelegt) und einer hochgeladenen Datei. */
async function firmaMitDaten() {
  const b = await angemeldet('Beta')
  const p = await b.daten('projekte', { aktion: 'insert', rueckgabe: true, werte: { name: 'Projekt B', created_by: b.userId } })
  assert.equal(p.statusCode, 200, p.body)
  const projektId = p.json().data[0].id as string
  const a = await b.daten('aufgaben', { aktion: 'insert', werte: { projekt_id: projektId, titel: 'Mangel', erstellt_von: b.userId } })
  assert.equal(a.statusCode, 200, a.body)
  const pfad = `${projektId}/plan.pdf`
  const up = await u.app.inject({
    method: 'PUT',
    url: `/api/dateien/plaene/${pfad}`,
    headers: { ...bearer(b.token), 'content-type': 'application/pdf' },
    payload: Buffer.from('%PDF-1.4 test'),
  })
  assert.equal(up.statusCode, 200, up.body)
  return { b, projektId, datei: path.join(u.konf.dateienVerzeichnis, 'plaene', projektId, 'plan.pdf') }
}

test('Nur Plattform-Admins duerfen Firmen stilllegen oder loeschen, nie die eigene', async () => {
  const betreiber = await angemeldet('Betreiber', true)
  const { b } = await firmaMitDaten()
  const fremd = await b.funktion('unternehmen-stilllegen', { unternehmen_id: betreiber.unternehmenId, stilllegen: true })
  assert.equal(fremd.statusCode, 403)
  const eigen = await betreiber.funktion('unternehmen-loeschen', { unternehmen_id: betreiber.unternehmenId, bestaetigung: 'Betreiber' })
  assert.equal(eigen.statusCode, 400)
})

test('Stilllegen sperrt Anmeldung und laufende Sitzungen, Freigeben hebt das auf', async () => {
  const betreiber = await angemeldet('Betreiber', true)
  const { b } = await firmaMitDaten()
  const r = await betreiber.funktion('unternehmen-stilllegen', { unternehmen_id: b.unternehmenId, stilllegen: true })
  assert.equal(r.statusCode, 200, r.body)

  const login = await anmelden(b.email)
  assert.equal(login.statusCode, 403)
  assert.equal(login.json().code, 'firma_stillgelegt')
  const alteSitzung = await b.daten('projekte', { aktion: 'select' })
  assert.equal(alteSitzung.statusCode, 401)

  const uebersicht = await u.app.inject({ method: 'POST', url: '/api/rpc/plattform_unternehmen_uebersicht', headers: bearer(betreiber.token), payload: {} })
  const eintrag = uebersicht.json().data.find((f: { id: string }) => f.id === b.unternehmenId)
  assert.ok(eintrag.stillgelegt_am)

  await betreiber.funktion('unternehmen-stilllegen', { unternehmen_id: b.unternehmenId, stilllegen: false })
  assert.equal((await anmelden(b.email)).statusCode, 200)
})

test('Loeschen entfernt Firma, Logins, Daten und Dateien -- andere Firmen bleiben', async () => {
  const betreiber = await angemeldet('Betreiber', true)
  const { b, projektId, datei } = await firmaMitDaten()
  await stat(datei)

  const falsch = await betreiber.funktion('unternehmen-loeschen', { unternehmen_id: b.unternehmenId, bestaetigung: 'Bet' })
  assert.equal(falsch.statusCode, 400)

  const r = await betreiber.funktion('unternehmen-loeschen', { unternehmen_id: b.unternehmenId, bestaetigung: 'Beta' })
  assert.equal(r.statusCode, 200, r.body)
  assert.equal(r.json().dateien, 1)

  const rest = await u.db.alsDienst(async (v) => ({
    firma: (await v.query('select 1 from public.unternehmen where id = $1', [b.unternehmenId])).rowCount,
    login: (await v.query('select 1 from auth.users where id = $1', [b.userId])).rowCount,
    projekt: (await v.query('select 1 from public.projekte where id = $1', [projektId])).rowCount,
    aufgaben: (await v.query('select 1 from public.aufgaben where projekt_id = $1', [projektId])).rowCount,
    objekte: (await v.query("select 1 from storage.objects where name like $1", [`${projektId}/%`])).rowCount,
    betreiber: (await v.query('select 1 from public.unternehmen where id = $1', [betreiber.unternehmenId])).rowCount,
  }))
  assert.deepEqual(rest, { firma: 0, login: 0, projekt: 0, aufgaben: 0, objekte: 0, betreiber: 1 })
  await assert.rejects(stat(datei))
  assert.equal((await anmelden(b.email)).statusCode, 400)
})
