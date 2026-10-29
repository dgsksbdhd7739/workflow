import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSWORT, bearer, datenbankLeeren, firmaMitNutzer, testUmgebung } from './hilfen.ts'

const u = await testUmgebung({ provisionGeheimnis: 'provision-geheimnis-fuer-tests-1234567890' })
after(() => u.beenden())
beforeEach(() => datenbankLeeren(u.db))

async function anmelden(email: string, passwort = PASSWORT) {
  return u.app.inject({ method: 'POST', url: '/api/auth/anmelden', payload: { email, passwort } })
}

async function angemeldet(name: string, rolle = 'admin') {
  const n = await firmaMitNutzer(u.db, name, { rolle })
  const r = await anmelden(n.email)
  assert.equal(r.statusCode, 200, r.body)
  const token = r.json().access_token as string
  const post = (url: string, payload: object) => u.app.inject({ method: 'POST', url, headers: bearer(token), payload })
  return { ...n, token, post }
}

async function projekt(a: Awaited<ReturnType<typeof angemeldet>>) {
  const r = await a.post('/api/daten/projekte', { aktion: 'insert', werte: { name: 'P', created_by: a.userId }, rueckgabe: true })
  return r.json().data[0].id as string
}

function hochladen(token: string, bucket: string, pfad: string, inhalt: Buffer | string, typ = 'application/pdf') {
  return u.app.inject({
    method: 'PUT', url: `/api/dateien/${bucket}/${pfad}`, headers: { ...bearer(token), 'content-type': typ }, payload: inhalt,
  })
}

describe('Dateien', () => {
  test('Hochladen, signierter Link, Herunterladen, Loeschen', async () => {
    const a = await angemeldet('Alpha')
    const p = await projekt(a)
    const pfad = `${p}/1700000000000-Plan EG.pdf`
    const hoch = await hochladen(a.token, 'plaene', encodeURI(pfad), 'PDF-INHALT')
    assert.equal(hoch.statusCode, 200, hoch.body)
    assert.equal(hoch.json().path, pfad)
    assert.equal((await hochladen(a.token, 'plaene', encodeURI(pfad), 'nochmal')).statusCode, 409)

    const sig = await a.post('/api/dateien/plaene/signieren', { pfad, sekunden: 60 })
    assert.equal(sig.statusCode, 200, sig.body)
    const laden = await u.app.inject({ method: 'GET', url: sig.json().signedUrl })
    assert.equal(laden.statusCode, 200)
    assert.equal(laden.body, 'PDF-INHALT')
    assert.equal(laden.headers['content-type'], 'application/pdf')

    const manipuliert = sig.json().signedUrl.replace(/ablauf=\d+/, 'ablauf=9999999999')
    assert.equal((await u.app.inject({ method: 'GET', url: manipuliert })).statusCode, 403)
    const andereDatei = sig.json().signedUrl.replace('Plan%20EG', 'Plan%20OG')
    assert.equal((await u.app.inject({ method: 'GET', url: andereDatei })).statusCode, 403)

    const weg = await a.post('/api/dateien/plaene/loeschen', { pfade: [pfad] })
    assert.deepEqual(weg.json().data.map((d: { name: string }) => d.name), [pfad])
    assert.equal((await u.app.inject({ method: 'GET', url: sig.json().signedUrl })).statusCode, 404)
    assert.equal((await a.post('/api/dateien/plaene/signieren', { pfad })).statusCode, 404)
  })

  test('JSON-Dateien werden roh gespeichert, nicht als Anfrage interpretiert', async () => {
    const a = await angemeldet('Alpha')
    const p = await projekt(a)
    const r = await hochladen(a.token, 'plaene', `${p}/daten.json`, '{"kaputt": ', 'application/json')
    assert.equal(r.statusCode, 200, r.body)
  })

  test('fremde Firma: kein Hochladen, kein Link, kein Loeschen', async () => {
    const a = await angemeldet('Alpha')
    const b = await angemeldet('Beta')
    const p = await projekt(a)
    const pfad = `${p}/geheim.pdf`
    assert.equal((await hochladen(a.token, 'plaene', pfad, 'X')).statusCode, 200)

    assert.equal((await hochladen(b.token, 'plaene', `${p}/kuckuck.pdf`, 'X')).statusCode, 403)
    assert.equal((await b.post('/api/dateien/plaene/signieren', { pfad })).statusCode, 404)
    assert.deepEqual((await b.post('/api/dateien/plaene/loeschen', { pfade: [pfad] })).json().data, [])
    assert.equal((await a.post('/api/dateien/plaene/signieren', { pfad })).statusCode, 200)
  })

  test('Pfad-Tricks, unbekannte Bereiche und zu grosse Dateien werden abgewiesen', async () => {
    const a = await angemeldet('Alpha')
    const p = await projekt(a)
    for (const pfad of ['..%2F..%2Fetc%2Fpasswd', `${p}/..%2F..%2Fx.pdf`, `${p}/.%2Fx.pdf`, `${p}//x.pdf`, `${p}/x%5C..%5Cy.pdf`, `${p}/x%00.pdf`]) {
      const r = await hochladen(a.token, 'plaene', pfad, 'X')
      assert.ok([400, 404].includes(r.statusCode), `${pfad} -> ${r.statusCode} ${r.body}`)
    }
    assert.equal((await hochladen(a.token, 'app-updates', `${p}/x.zip`, 'X')).statusCode, 404)
    assert.equal((await a.post('/api/dateien/plaene/signieren', { pfad: '../../etc/passwd' })).statusCode, 400)
    assert.equal((await hochladen(a.token, 'plaene', `${p}/gross.pdf`, Buffer.alloc(6 * 1024 * 1024))).statusCode, 413)
    const ohne = await u.app.inject({ method: 'PUT', url: `/api/dateien/plaene/${p}/x.pdf`, payload: 'X', headers: { 'content-type': 'application/pdf' } })
    assert.equal(ohne.statusCode, 401)
  })
})

describe('Verwaltungsfunktionen', () => {
  test('create-user: Admin legt Nutzer in eigener Firma an, Techniker darf nicht', async () => {
    const a = await angemeldet('Alpha')
    const r = await a.post('/api/funktionen/create-user', { email: 'neu@test.example', password: 'start123', full_name: 'Neu', role: 'planer' })
    assert.equal(r.statusCode, 200, r.body)
    const neu = await anmelden('neu@test.example', 'start123')
    assert.equal(neu.statusCode, 200)
    const profil = await u.db.alsDienst(async (v) => (await v.query('select role, unternehmen_id from public.profiles where id = $1', [r.json().id])).rows[0])
    assert.deepEqual(profil, { role: 'planer', unternehmen_id: a.unternehmenId })

    assert.equal((await a.post('/api/funktionen/create-user', { email: 'NEU@test.example', password: 'start123' })).statusCode, 409)
    const t = await angemeldet('Gamma', 'techniker')
    assert.equal((await t.post('/api/funktionen/create-user', { email: 'x@test.example', password: 'start123' })).statusCode, 403)
  })

  test('create-user: Nutzerlimit wird eingehalten', async () => {
    const a = await angemeldet('Alpha')
    await u.db.alsDienst((v) => v.query('update public.unternehmen set max_nutzer = 1 where id = $1', [a.unternehmenId]))
    const r = await a.post('/api/funktionen/create-user', { email: 'zuviel@test.example', password: 'start123' })
    assert.equal(r.statusCode, 403)
    assert.match(r.json().error, /Nutzerlimit/)
  })

  test('Nutzer einer fremden Firma sind fuer Admins unerreichbar (behobene Luecke)', async () => {
    const a = await angemeldet('Alpha')
    const b = await angemeldet('Beta')
    const passwort = await a.post('/api/funktionen/reset-user-password', { user_id: b.userId, password: 'gekapert1' })
    assert.equal(passwort.statusCode, 404)
    assert.equal((await a.post('/api/funktionen/set-user-active', { user_id: b.userId, aktiv: false })).statusCode, 404)
    assert.equal((await a.post('/api/funktionen/delete-user', { user_id: b.userId })).statusCode, 404)
    assert.equal((await anmelden(b.email)).statusCode, 200)
  })

  test('Passwort zuruecksetzen, deaktivieren, aktivieren, loeschen (eigene Firma)', async () => {
    const a = await angemeldet('Alpha')
    const anlegen = await a.post('/api/funktionen/create-user', { email: 'mit@test.example', password: 'start123' })
    const id = anlegen.json().id as string
    const sitzung = (await anmelden('mit@test.example', 'start123')).json().access_token
    const ich = (t: string) => u.app.inject({ method: 'GET', url: '/api/auth/nutzer', headers: bearer(t) })

    assert.equal((await a.post('/api/funktionen/reset-user-password', { user_id: id, password: 'admin-vergeben' })).statusCode, 200)
    assert.equal((await ich(sitzung)).statusCode, 401, 'alte Sitzung nach Passwort-Reset beendet')
    assert.equal((await anmelden('mit@test.example', 'admin-vergeben')).statusCode, 200)
    const muss = await u.db.alsDienst(async (v) => (await v.query('select muss_passwort_aendern from public.profiles where id = $1', [id])).rows[0])
    assert.equal(muss.muss_passwort_aendern, true)

    const neueSitzung = (await anmelden('mit@test.example', 'admin-vergeben')).json().access_token
    assert.equal((await a.post('/api/funktionen/set-user-active', { user_id: id, aktiv: false })).statusCode, 200)
    assert.equal((await ich(neueSitzung)).statusCode, 401, 'Deaktivieren beendet Sitzungen sofort')
    assert.equal((await anmelden('mit@test.example', 'admin-vergeben')).statusCode, 403)
    assert.equal((await a.post('/api/funktionen/set-user-active', { user_id: a.userId, aktiv: false })).statusCode, 400)
    assert.equal((await a.post('/api/funktionen/set-user-active', { user_id: id, aktiv: true })).statusCode, 200)
    assert.equal((await anmelden('mit@test.example', 'admin-vergeben')).statusCode, 200)

    assert.equal((await a.post('/api/funktionen/delete-user', { user_id: a.userId })).statusCode, 400)
    assert.equal((await a.post('/api/funktionen/delete-user', { user_id: id })).statusCode, 200)
    assert.equal((await anmelden('mit@test.example', 'admin-vergeben')).statusCode, 400)
  })

  test('create-unternehmen: nur Plattform-Admin oder Provision-Geheimnis', async () => {
    const payload = { firmenname: 'Neufirma', admin_email: 'chef@neufirma.example', paket: 'starter' }
    assert.equal((await u.app.inject({ method: 'POST', url: '/api/funktionen/create-unternehmen', payload })).statusCode, 401)
    const falsch = await u.app.inject({ method: 'POST', url: '/api/funktionen/create-unternehmen', headers: { 'x-provision-secret': 'falsch' }, payload })
    assert.equal(falsch.statusCode, 401)

    const a = await angemeldet('Alpha')
    assert.equal((await a.post('/api/funktionen/create-unternehmen', payload)).statusCode, 401)
    await u.db.alsDienst((v) => v.query('insert into public.plattform_admins (user_id) values ($1)', [a.userId]))
    const r = await a.post('/api/funktionen/create-unternehmen', payload)
    assert.equal(r.statusCode, 200, r.body)
    const login = await anmelden('chef@neufirma.example', r.json().admin_password)
    assert.equal(login.statusCode, 200)

    const perSkript = await u.app.inject({
      method: 'POST', url: '/api/funktionen/create-unternehmen',
      headers: { 'x-provision-secret': 'provision-geheimnis-fuer-tests-1234567890' },
      payload: { firmenname: 'Skriptfirma', admin_email: 'chef@skript.example', admin_password: 'vorgegeben1' },
    })
    assert.equal(perSkript.statusCode, 200, perSkript.body)
    assert.equal((await anmelden('chef@skript.example', 'vorgegeben1')).statusCode, 200)
  })
})
