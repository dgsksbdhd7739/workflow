import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { PASSWORT, bearer, datenbankLeeren, firmaMitNutzer, testUmgebung } from './hilfen.ts'

const u = await testUmgebung()
let basis = ''
before(async () => {
  await u.app.listen({ host: '127.0.0.1', port: 0 })
  basis = `127.0.0.1:${(u.app.server.address() as AddressInfo).port}`
})
after(() => u.beenden())
beforeEach(() => datenbankLeeren(u.db))

async function angemeldet(name: string) {
  const n = await firmaMitNutzer(u.db, name, { rolle: 'admin' })
  const r = await u.app.inject({ method: 'POST', url: '/api/auth/anmelden', payload: { email: n.email, passwort: PASSWORT } })
  return { ...n, token: r.json().access_token as string }
}

/** WebSocket-Client, der alle Nachrichten sammelt und auf bestimmte warten kann. */
async function verbinden(token: string) {
  const ws = new WebSocket(`ws://${basis}/api/live`)
  const empfangen: Record<string, unknown>[] = []
  const wartende: { pruefen: (n: Record<string, unknown>) => boolean; fertig: (n: Record<string, unknown>) => void }[] = []
  ws.addEventListener('message', (e) => {
    const n = JSON.parse(String(e.data))
    empfangen.push(n)
    for (const w of [...wartende]) if (w.pruefen(n)) { wartende.splice(wartende.indexOf(w), 1); w.fertig(n) }
  })
  await new Promise((ok) => ws.addEventListener('open', ok, { once: true }))
  const warte = (pruefen: (n: Record<string, unknown>) => boolean, ms = 3000) =>
    new Promise<Record<string, unknown>>((ok, nein) => {
      const schon = empfangen.find(pruefen)
      if (schon) return ok(schon)
      const t = setTimeout(() => nein(new Error(`Zeitüberschreitung, empfangen: ${JSON.stringify(empfangen)}`)), ms)
      wartende.push({ pruefen, fertig: (n) => { clearTimeout(t); ok(n) } })
    })
  const sende = (n: object) => ws.send(JSON.stringify(n))
  sende({ typ: 'anmelden', token })
  await warte((n) => n.typ === 'angemeldet')
  return { ws, empfangen, warte, sende }
}

function nachricht(a: Awaited<ReturnType<typeof angemeldet>>, text: string) {
  return u.app.inject({
    method: 'POST', url: '/api/daten/chat_nachrichten', headers: bearer(a.token),
    payload: { aktion: 'insert', werte: { unternehmen_id: a.unternehmenId, user_id: a.userId, text }, rueckgabe: true },
  })
}

test('Team-Chat: neue und geloeschte Nachrichten kommen nur bei der eigenen Firma an', async () => {
  const a = await angemeldet('Alpha')
  const b = await angemeldet('Beta')
  const wa = await verbinden(a.token)
  const wb = await verbinden(b.token)

  wa.sende({ typ: 'abonnieren', kanal: 'chat', tabelle: 'chat_nachrichten', wert: a.unternehmenId })
  await wa.warte((n) => n.typ === 'abonniert')
  // B versucht, den Chat von A zu abonnieren:
  wb.sende({ typ: 'abonnieren', kanal: 'spion', tabelle: 'chat_nachrichten', wert: a.unternehmenId })
  const abgelehnt = await wb.warte((n) => n.kanal === 'spion')
  assert.equal(abgelehnt.typ, 'fehler')
  wb.sende({ typ: 'abonnieren', kanal: 'chat', tabelle: 'chat_nachrichten', wert: b.unternehmenId })
  await wb.warte((n) => n.typ === 'abonniert')

  const r = await nachricht(a, 'Hallo Team A')
  assert.equal(r.statusCode, 200, r.body)
  const id = r.json().data[0].id
  const neu = await wa.warte((n) => n.typ === 'ereignis' && n.ereignis === 'INSERT')
  assert.equal((neu.neu as { text: string }).text, 'Hallo Team A')

  await u.app.inject({
    method: 'POST', url: '/api/daten/chat_nachrichten', headers: bearer(a.token),
    payload: { aktion: 'delete', filter: [{ spalte: 'id', op: 'eq', wert: id }] },
  })
  const weg = await wa.warte((n) => n.typ === 'ereignis' && n.ereignis === 'DELETE')
  assert.deepEqual(weg.alt, { id })

  // B hat nichts von A bekommen.
  await new Promise((ok) => setTimeout(ok, 300))
  assert.equal(wb.empfangen.filter((n) => n.typ === 'ereignis').length, 0)
  wa.ws.close()
  wb.ws.close()
})

test('ohne gueltige Anmeldung keine Abos; Abmelden beendet die Live-Verbindung', async () => {
  const a = await angemeldet('Alpha')
  const ws = new WebSocket(`ws://${basis}/api/live`)
  const antworten: Record<string, unknown>[] = []
  ws.addEventListener('message', (e) => antworten.push(JSON.parse(String(e.data))))
  await new Promise((ok) => ws.addEventListener('open', ok, { once: true }))
  ws.send(JSON.stringify({ typ: 'abonnieren', kanal: 'x', tabelle: 'chat_nachrichten', wert: a.unternehmenId }))
  ws.send(JSON.stringify({ typ: 'anmelden', token: 'kaputt' }))
  await new Promise((ok) => setTimeout(ok, 300))
  assert.deepEqual(antworten.map((n) => n.code), ['nicht_angemeldet', 'token_ungueltig'])
  ws.close()

  const w = await verbinden(a.token)
  w.sende({ typ: 'abonnieren', kanal: 'chat', tabelle: 'chat_nachrichten', wert: a.unternehmenId })
  await w.warte((n) => n.typ === 'abonniert')
  await u.app.inject({ method: 'POST', url: '/api/auth/abmelden', headers: bearer(a.token), payload: {} })
  const geschlossen = new Promise((ok) => w.ws.addEventListener('close', ok, { once: true }))
  // Naechste Pruefung erzwingen: Sitzungscache umgehen, indem neu angemeldet wird.
  w.sende({ typ: 'anmelden', token: a.token })
  await geschlossen
})
