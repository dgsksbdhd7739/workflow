import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSWORT, bearer, datenbankLeeren, firmaMitNutzer, testUmgebung } from './hilfen.ts'

const u = await testUmgebung()
after(() => u.beenden())
beforeEach(() => datenbankLeeren(u.db))

async function anmelden(email: string) {
  const r = await u.app.inject({ method: 'POST', url: '/api/auth/anmelden', payload: { email, passwort: PASSWORT } })
  assert.equal(r.statusCode, 200, r.body)
  return r.json().access_token as string
}

/** Admin einer neuen Firma, angemeldet, mit Hilfsfunktion fuer Daten-Anfragen. */
async function admin(name: string) {
  const n = await firmaMitNutzer(u.db, name, { rolle: 'admin' })
  const token = await anmelden(n.email)
  const daten = (tabelle: string, abfrage: object) =>
    u.app.inject({ method: 'POST', url: `/api/daten/${encodeURIComponent(tabelle)}`, headers: bearer(token), payload: abfrage })
  return { ...n, token, daten }
}

async function projektAnlegen(a: Awaited<ReturnType<typeof admin>>, name: string) {
  const r = await a.daten('projekte', { aktion: 'insert', werte: { name, created_by: a.userId }, rueckgabe: true })
  assert.equal(r.statusCode, 200, r.body)
  return r.json().data[0] as { id: string; unternehmen_id: string; name: string }
}

describe('Daten-Schnittstelle: Grundfunktionen', () => {
  test('ohne Anmeldung: 401', async () => {
    const r = await u.app.inject({ method: 'POST', url: '/api/daten/projekte', payload: { aktion: 'select' } })
    assert.equal(r.statusCode, 401)
  })

  test('insert mit Rueckgabe setzt Firmen-Default, select mit Filter/Sortierung/Limit', async () => {
    const a = await admin('Alpha')
    const p1 = await projektAnlegen(a, 'Zebra')
    await projektAnlegen(a, 'Anton')
    assert.equal(p1.unternehmen_id, a.unternehmenId)

    const sortiert = await a.daten('projekte', { aktion: 'select', spalten: 'id, name', sortierung: [{ spalte: 'name' }] })
    assert.deepEqual(sortiert.json().data.map((p: { name: string }) => p.name), ['Anton', 'Zebra'])
    assert.deepEqual(Object.keys(sortiert.json().data[0]).sort(), ['id', 'name'])

    const absteigend = await a.daten('projekte', { aktion: 'select', sortierung: [{ spalte: 'name', absteigend: true }], limit: 1 })
    assert.equal(absteigend.json().data.length, 1)
    assert.equal(absteigend.json().data[0].name, 'Zebra')

    const gefiltert = await a.daten('projekte', { aktion: 'select', filter: [{ spalte: 'id', op: 'eq', wert: p1.id }] })
    assert.equal(gefiltert.json().data.length, 1)

    const liste = await a.daten('projekte', { aktion: 'select', filter: [{ spalte: 'id', op: 'in', wert: [p1.id] }] })
    assert.equal(liste.json().data.length, 1)
  })

  test('Zaehlen (count/head), is null und not is null', async () => {
    const a = await admin('Alpha')
    const p = await projektAnlegen(a, 'P')
    await a.daten('projekte', { aktion: 'update', werte: { adresse: 'Hauptstr. 1' }, filter: [{ spalte: 'id', op: 'eq', wert: p.id }] })
    await projektAnlegen(a, 'Q')

    const nurAnzahl = await a.daten('projekte', { aktion: 'select', nurZaehlen: true })
    assert.deepEqual(nurAnzahl.json(), { data: null, count: 2 })
    const leer = await a.daten('projekte', { aktion: 'select', filter: [{ spalte: 'adresse', op: 'is', wert: null }] })
    assert.equal(leer.json().data.length, 1)
    const gesetzt = await a.daten('projekte', { aktion: 'select', filter: [{ spalte: 'adresse', op: 'is', wert: null, nicht: true }] })
    assert.equal(gesetzt.json().data[0].adresse, 'Hauptstr. 1')
  })

  test('update/delete mit Rueckgabe, ohne Filter verboten', async () => {
    const a = await admin('Alpha')
    const p = await projektAnlegen(a, 'Alt')
    const ohneFilter = await a.daten('projekte', { aktion: 'update', werte: { name: 'x' } })
    assert.equal(ohneFilter.statusCode, 400)
    assert.equal((await a.daten('projekte', { aktion: 'delete' })).statusCode, 400)

    const neu = await a.daten('projekte', {
      aktion: 'update', werte: { name: 'Neu' }, filter: [{ spalte: 'id', op: 'eq', wert: p.id }], rueckgabe: true,
    })
    assert.equal(neu.json().data[0].name, 'Neu')
    const weg = await a.daten('projekte', { aktion: 'delete', filter: [{ spalte: 'id', op: 'eq', wert: p.id }], rueckgabe: true })
    assert.equal(weg.json().data.length, 1)
    const ohneRueckgabe = await a.daten('projekte', { aktion: 'delete', filter: [{ spalte: 'id', op: 'eq', wert: p.id }] })
    assert.deepEqual(ohneRueckgabe.json(), { data: null, count: null })
  })

  test('jsonb-Werte (auch Arrays) bleiben erhalten', async () => {
    const a = await admin('Alpha')
    const p = await projektAnlegen(a, 'P')
    const filter = { status: ['offen', 'in_arbeit'], nur_meine: true }
    const r = await a.daten('aufgaben_filter', {
      aktion: 'insert', werte: { user_id: a.userId, projekt_id: p.id, name: 'Meine', filter }, rueckgabe: true,
    })
    assert.equal(r.statusCode, 200, r.body)
    assert.deepEqual(r.json().data[0].filter, filter)
    const arr = await a.daten('aufgaben_filter', {
      aktion: 'insert', werte: { user_id: a.userId, projekt_id: p.id, name: 'Liste', filter: [1, 2] }, rueckgabe: true,
    })
    assert.deepEqual(arr.json().data[0].filter, [1, 2])
  })

  test('upsert mit Konfliktspalten aktualisiert statt doppelt anzulegen', async () => {
    const a = await admin('Alpha')
    const zeile = (name: string) => ({ user_id: a.userId, geraet_kennung: 'geraet-1', geraet_name: name })
    const upsert = (name: string) => a.daten('nutzer_sitzungen', { aktion: 'upsert', werte: zeile(name), konflikt: 'user_id,geraet_kennung' })
    assert.equal((await upsert('Handy')).statusCode, 200)
    assert.equal((await upsert('Handy neu')).statusCode, 200)
    const alle = await a.daten('nutzer_sitzungen', { aktion: 'select' })
    assert.equal(alle.json().data.length, 1)
    assert.equal(alle.json().data[0].geraet_name, 'Handy neu')
  })

  test('RPC: freigegebene Funktion laeuft, andere nicht', async () => {
    const a = await admin('Alpha')
    const rpc = (name: string) => u.app.inject({ method: 'POST', url: `/api/rpc/${name}`, headers: bearer(a.token), payload: {} })
    const r = await rpc('meine_aktiven_geraete')
    assert.equal(r.statusCode, 200, r.body)
    assert.ok(Array.isArray(r.json().data))
    assert.equal((await rpc('handle_new_user')).statusCode, 404)
    assert.equal((await rpc('current_unternehmen_id')).statusCode, 404)
  })
})

describe('Daten-Schnittstelle: Angriffsversuche', () => {
  test('nur freigegebene Tabellen (public mit RLS) erreichbar', async () => {
    const a = await admin('Alpha')
    for (const tabelle of ['users', 'auth.users', 'schema_migrationen', 'app_settings', 'objects', 'pg_authid', 'projekte; drop table projekte']) {
      const r = await a.daten(tabelle, { aktion: 'select' })
      assert.equal(r.statusCode, 404, `${tabelle}: ${r.body}`)
    }
  })

  test('Spaltennamen, Sortierung, Operatoren und Limit werden streng geprueft', async () => {
    const a = await admin('Alpha')
    const versuche = [
      { aktion: 'select', spalten: 'id, (select email from auth.users limit 1)' },
      { aktion: 'select', spalten: 'id; drop table projekte' },
      { aktion: 'select', spalten: 'projekte.*' },
      { aktion: 'select', sortierung: [{ spalte: 'name desc; drop table projekte' }] },
      { aktion: 'select', filter: [{ spalte: 'name', op: 'or 1=1 --', wert: 'x' }] },
      { aktion: 'select', filter: [{ spalte: 'name = name or true --', op: 'eq', wert: 'x' }] },
      { aktion: 'select', filter: [{ spalte: 'adresse', op: 'is', wert: 'null; drop table projekte' }] },
      { aktion: 'select', limit: '1; drop table projekte' },
      { aktion: 'insert', werte: { 'name) values (1); --': 'x' } },
      { aktion: 'truncate' },
    ]
    for (const v of versuche) {
      const r = await a.daten('projekte', v)
      assert.equal(r.statusCode, 400, `${JSON.stringify(v)} -> ${r.statusCode} ${r.body}`)
    }
    // Werte landen nur als Parameter -- ein "boeser" Wert ist einfach ein Text.
    const p = await projektAnlegen(a, "x'); drop table projekte; --")
    assert.equal(p.name, "x'); drop table projekte; --")
    assert.equal((await a.daten('projekte', { aktion: 'select' })).json().data.length, 1)
  })
})

describe('Daten-Schnittstelle: Mandantentrennung', () => {
  test('Firma B kann Daten von Firma A weder lesen, aendern, loeschen noch unterschieben', async () => {
    const a = await admin('Alpha')
    const b = await admin('Beta')
    const pA = await projektAnlegen(a, 'Geheim A')
    const auf = await a.daten('aufgaben', {
      aktion: 'insert', werte: { projekt_id: pA.id, titel: 'Aufgabe A', erstellt_von: a.userId }, rueckgabe: true,
    })
    assert.equal(auf.statusCode, 200, auf.body)
    const nachId = [{ spalte: 'id', op: 'eq', wert: pA.id }]

    assert.deepEqual((await b.daten('projekte', { aktion: 'select' })).json().data, [])
    assert.deepEqual((await b.daten('projekte', { aktion: 'select', filter: nachId })).json().data, [])
    assert.equal((await b.daten('projekte', { aktion: 'select', nurZaehlen: true })).json().count, 0)
    assert.deepEqual((await b.daten('aufgaben', { aktion: 'select' })).json().data, [])
    assert.deepEqual((await b.daten('unternehmen', { aktion: 'select', spalten: 'id' })).json().data, [{ id: b.unternehmenId }])
    assert.deepEqual((await b.daten('profiles', { aktion: 'select', spalten: 'id' })).json().data, [{ id: b.userId }])

    const aendern = await b.daten('projekte', { aktion: 'update', werte: { name: 'gehackt' }, filter: nachId, rueckgabe: true })
    assert.deepEqual(aendern.json().data, [])
    const loeschen = await b.daten('projekte', { aktion: 'delete', filter: nachId, rueckgabe: true })
    assert.deepEqual(loeschen.json().data, [])
    const firmaAendern = await b.daten('unternehmen', {
      aktion: 'update', werte: { name: 'gehackt' }, filter: [{ spalte: 'id', op: 'eq', wert: a.unternehmenId }], rueckgabe: true,
    })
    assert.deepEqual(firmaAendern.json().data, [])

    // Projekt explizit in Firma A anlegen bzw. Aufgabe in A's Projekt schieben: RLS verweigert.
    const unterschieben = await b.daten('projekte', {
      aktion: 'insert', werte: { name: 'Kuckuck', created_by: b.userId, unternehmen_id: a.unternehmenId },
    })
    assert.equal(unterschieben.statusCode, 403, unterschieben.body)
    const aufgabeUnterschieben = await b.daten('aufgaben', {
      aktion: 'insert', werte: { projekt_id: pA.id, titel: 'Kuckuck', erstellt_von: b.userId },
    })
    assert.equal(aufgabeUnterschieben.statusCode, 403, aufgabeUnterschieben.body)
    const eigeneRolle = await b.daten('profiles', {
      aktion: 'update', werte: { unternehmen_id: a.unternehmenId }, filter: [{ spalte: 'id', op: 'eq', wert: b.userId }],
    })
    assert.notEqual(eigeneRolle.statusCode, 200, 'Wechsel in fremde Firma darf nicht gelingen')

    // A sieht alles unveraendert.
    const nachher = await a.daten('projekte', { aktion: 'select', filter: nachId })
    assert.equal(nachher.json().data[0].name, 'Geheim A')
  })

  test('Techniker darf keine Projekte anlegen (Rollenrechte aus den Policies)', async () => {
    const t = await firmaMitNutzer(u.db, 'Gamma', { rolle: 'techniker' })
    const token = await anmelden(t.email)
    const r = await u.app.inject({
      method: 'POST', url: '/api/daten/projekte', headers: bearer(token),
      payload: { aktion: 'insert', werte: { name: 'X', created_by: t.userId } },
    })
    assert.equal(r.statusCode, 403, r.body)
  })
})
