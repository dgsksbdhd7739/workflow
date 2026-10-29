import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSWORT, bearer, datenbankLeeren, firmaMitNutzer, testUmgebung } from './hilfen.ts'

const u = await testUmgebung()
after(() => u.beenden())
beforeEach(() => datenbankLeeren(u.db))

async function angemeldet(name: string, rolle = 'admin') {
  const n = await firmaMitNutzer(u.db, name, { rolle })
  const r = await u.app.inject({ method: 'POST', url: '/api/auth/anmelden', payload: { email: n.email, passwort: PASSWORT } })
  const token = r.json().access_token as string
  const daten = (tabelle: string, abfrage: object) =>
    u.app.inject({ method: 'POST', url: `/api/daten/${tabelle}`, headers: bearer(token), payload: abfrage })
  return { ...n, token, daten }
}

type Nutzer = Awaited<ReturnType<typeof angemeldet>>

async function anlegen(a: Nutzer, tabelle: string, werte: object) {
  const r = await a.daten(tabelle, { aktion: 'insert', werte, rueckgabe: true })
  assert.equal(r.statusCode, 200, `${tabelle}: ${r.body}`)
  return r.json().data[0] as { id: string } & Record<string, unknown>
}

/** Projekt mit Gebaeude, zwei Geschossen und je zwei Einheiten. */
async function gebaeudeMitEtagen(a: Nutzer) {
  const p = await anlegen(a, 'projekte', { name: 'Birkenkarree', created_by: a.userId })
  const g = await anlegen(a, 'gebaeude', { projekt_id: p.id, name: 'Haus A', erstellt_von: a.userId })
  const eg = await anlegen(a, 'geschosse', { gebaeude_id: g.id, projekt_id: p.id, name: 'EG', ebene: 0 })
  const og = await anlegen(a, 'geschosse', { gebaeude_id: g.id, projekt_id: p.id, name: 'OG 1', ebene: 1 })
  const r = await a.daten('einheiten', {
    aktion: 'insert', rueckgabe: true,
    werte: [
      { geschoss_id: eg.id, projekt_id: p.id, name: 'Whg 0.1', reihenfolge: 0 },
      { geschoss_id: eg.id, projekt_id: p.id, name: 'Laden', art: 'gewerbe', reihenfolge: 1 },
      { geschoss_id: og.id, projekt_id: p.id, name: 'Whg 1.1', reihenfolge: 0, flaeche_m2: 72.5 },
    ],
  })
  assert.equal(r.statusCode, 200, r.body)
  return { p, g, eg, og, einheiten: r.json().data as { id: string; geschoss_id: string; flaeche_m2: number | null }[] }
}

describe('Geschosse und Einheiten', () => {
  test('anlegen, Grundriss-Defaults und Zahlen', async () => {
    const a = await angemeldet('Alpha')
    const { g, einheiten } = await gebaeudeMitEtagen(a)
    assert.equal(g.breite_m, 24)
    assert.equal(einheiten.find((e) => e.flaeche_m2)?.flaeche_m2, 72.5)
    const doppelt = await a.daten('geschosse', { aktion: 'insert', werte: { gebaeude_id: g.id, projekt_id: g.projekt_id, name: 'EG2', ebene: 0 } })
    assert.equal(doppelt.statusCode, 409, 'Ebene je Gebaeude eindeutig')
  })

  test('Geschoss muss zum Projekt seines Gebaeudes gehoeren', async () => {
    const a = await angemeldet('Alpha')
    const { g } = await gebaeudeMitEtagen(a)
    const anderes = await anlegen(a, 'projekte', { name: 'Anderes', created_by: a.userId })
    const falsch = await a.daten('geschosse', { aktion: 'insert', werte: { gebaeude_id: g.id, projekt_id: anderes.id, name: 'OG 9', ebene: 9 } })
    assert.equal(falsch.statusCode, 400, falsch.body)
  })

  test('Aufgaben: genau ein Bereich, nur aus dem eigenen Projekt, Loeschen entfernt nur die Zuordnung', async () => {
    const a = await angemeldet('Alpha')
    const { p, og, einheiten } = await gebaeudeMitEtagen(a)
    const whg = einheiten[0]
    const aufgabe = await anlegen(a, 'aufgaben', { projekt_id: p.id, titel: 'Fliesen Bad', erstellt_von: a.userId, einheit_id: whg.id })
    assert.equal(aufgabe.einheit_id, whg.id)

    const zwei = await a.daten('aufgaben', {
      aktion: 'insert', werte: { projekt_id: p.id, titel: 'x', erstellt_von: a.userId, einheit_id: whg.id, geschoss_id: og.id },
    })
    assert.equal(zwei.statusCode, 400, 'nicht Einheit und Geschoss gleichzeitig')

    const anderes = await anlegen(a, 'projekte', { name: 'Anderes', created_by: a.userId })
    const fremdesProjekt = await a.daten('aufgaben', {
      aktion: 'insert', werte: { projekt_id: anderes.id, titel: 'x', erstellt_von: a.userId, einheit_id: whg.id },
    })
    assert.equal(fremdesProjekt.statusCode, 400, 'Einheit aus anderem Projekt')

    await a.daten('einheiten', { aktion: 'delete', filter: [{ spalte: 'id', op: 'eq', wert: whg.id }] })
    const nachher = await a.daten('aufgaben', { aktion: 'select', filter: [{ spalte: 'id', op: 'eq', wert: aufgabe.id }] })
    assert.equal(nachher.json().data[0].einheit_id, null)
    assert.equal(nachher.json().data[0].projekt_id, p.id)
  })

  test('Firmengrenze und Rollen', async () => {
    const a = await angemeldet('Alpha')
    const { p, g, og } = await gebaeudeMitEtagen(a)
    const b = await angemeldet('Beta')
    for (const t of ['geschosse', 'einheiten']) {
      assert.deepEqual((await b.daten(t, { aktion: 'select' })).json().data, [], t)
    }
    const unterschieben = await b.daten('geschosse', { aktion: 'insert', werte: { gebaeude_id: g.id, projekt_id: p.id, name: 'OG 5', ebene: 5 } })
    assert.equal(unterschieben.statusCode, 403, unterschieben.body)
    const loeschen = await b.daten('geschosse', { aktion: 'delete', filter: [{ spalte: 'id', op: 'eq', wert: og.id }], rueckgabe: true })
    assert.deepEqual(loeschen.json().data, [])

    // Techniker derselben Firma: lesen ja, anlegen nein.
    const t = await firmaMitNutzer(u.db, 'Alpha-Techniker', { rolle: 'techniker' })
    await u.db.alsDienst((v) => v.query('update public.profiles set unternehmen_id = $1 where id = $2', [a.unternehmenId, t.userId]))
    const tok = (await u.app.inject({ method: 'POST', url: '/api/auth/anmelden', payload: { email: t.email, passwort: PASSWORT } })).json().access_token
    const lesen = await u.app.inject({ method: 'POST', url: '/api/daten/geschosse', headers: bearer(tok), payload: { aktion: 'select' } })
    assert.equal(lesen.json().data.length, 2)
    const schreiben = await u.app.inject({
      method: 'POST', url: '/api/daten/geschosse', headers: bearer(tok),
      payload: { aktion: 'insert', werte: { gebaeude_id: g.id, projekt_id: p.id, name: 'OG 2', ebene: 2 } },
    })
    assert.equal(schreiben.statusCode, 403)
  })
})
