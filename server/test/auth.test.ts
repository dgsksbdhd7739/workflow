import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { erstelleMfaToken } from '../src/auth/token.ts'
import { PASSWORT, bearer, datenbankLeeren, firmaMitNutzer, testUmgebung, totpCode } from './hilfen.ts'

const u = await testUmgebung()
after(() => u.beenden())
beforeEach(() => datenbankLeeren(u.db))

async function anmelden(email: string, passwort = PASSWORT) {
  return u.app.inject({ method: 'POST', url: '/api/auth/anmelden', payload: { email, passwort } })
}

async function sitzung(email: string) {
  const r = await anmelden(email)
  assert.equal(r.statusCode, 200, r.body)
  return r.json() as { access_token: string; refresh_token: string; aal: string; user: { id: string } }
}

function nutzer(token: string) {
  return u.app.inject({ method: 'GET', url: '/api/auth/nutzer', headers: bearer(token) })
}

describe('Anmeldung', () => {
  test('richtiges Passwort liefert Sitzung (aal1), Gross-/Kleinschreibung der E-Mail egal', async () => {
    const { email, userId } = await firmaMitNutzer(u.db, 'Alpha')
    const s = await sitzung(email.toUpperCase())
    assert.equal(s.aal, 'aal1')
    assert.equal(s.user.id, userId)
    const ich = await nutzer(s.access_token)
    assert.equal(ich.statusCode, 200)
    assert.equal(ich.json().id, userId)
  })

  test('falsches Passwort und unbekannte E-Mail geben dieselbe Meldung', async () => {
    const { email } = await firmaMitNutzer(u.db, 'Alpha')
    const falsch = await anmelden(email, 'falsch')
    const unbekannt = await anmelden('niemand@test.example')
    assert.equal(falsch.statusCode, 400)
    assert.equal(unbekannt.statusCode, 400)
    assert.equal(falsch.json().error, unbekannt.json().error)
  })

  test('uebernommener Supabase-Hash ($2a$10$) funktioniert', async () => {
    const { email } = await firmaMitNutzer(u.db, 'Alpha', { kosten: 10 })
    await sitzung(email)
  })

  test('gesperrtes Konto kann sich nicht anmelden', async () => {
    const { email } = await firmaMitNutzer(u.db, 'Alpha', { gesperrt: true })
    const r = await anmelden(email)
    assert.equal(r.statusCode, 403)
    assert.equal(r.json().code, 'konto_gesperrt')
  })

  test('Sperre wirkt sofort auf bestehende Sitzung und Erneuerung', async () => {
    const { email, userId } = await firmaMitNutzer(u.db, 'Alpha')
    const s = await sitzung(email)
    await u.db.alsDienst((v) => v.query("update auth.users set banned_until = '2999-01-01' where id = $1", [userId]))
    assert.equal((await nutzer(s.access_token)).statusCode, 401)
    const r = await u.app.inject({ method: 'POST', url: '/api/auth/erneuern', payload: { refresh_token: s.refresh_token } })
    assert.equal(r.statusCode, 401)
  })
})

describe('Zugriffsschutz', () => {
  test('ohne, mit kaputtem oder fremd signiertem Token: 401', async () => {
    assert.equal((await u.app.inject({ method: 'GET', url: '/api/auth/nutzer' })).statusCode, 401)
    assert.equal((await nutzer('kein.jwt.token')).statusCode, 401)
    const { email } = await firmaMitNutzer(u.db, 'Alpha')
    const s = await sitzung(email)
    const [kopf, inhalt] = s.access_token.split('.')
    const gefaelscht = JSON.parse(Buffer.from(inhalt, 'base64url').toString())
    gefaelscht.sub = '00000000-0000-0000-0000-000000000000'
    const manipuliert = `${kopf}.${Buffer.from(JSON.stringify(gefaelscht)).toString('base64url')}.${s.access_token.split('.')[2]}`
    assert.equal((await nutzer(manipuliert)).statusCode, 401)
  })

  test('2FA-Zwischentoken taugt nicht als Zugriffstoken', async () => {
    const { userId } = await firmaMitNutzer(u.db, 'Alpha')
    const mfaToken = await erstelleMfaToken(userId, u.konf.jwtGeheimnis)
    assert.equal((await nutzer(mfaToken)).statusCode, 401)
  })
})

describe('Sitzungen', () => {
  test('Erneuern rotiert das Refresh-Token, Vorgaenger gilt nur kurz weiter', async () => {
    const { email } = await firmaMitNutzer(u.db, 'Alpha')
    const s1 = await sitzung(email)
    const erneuern = (rt: string) => u.app.inject({ method: 'POST', url: '/api/auth/erneuern', payload: { refresh_token: rt } })
    const r2 = await erneuern(s1.refresh_token)
    assert.equal(r2.statusCode, 200)
    const s2 = r2.json()
    assert.notEqual(s2.refresh_token, s1.refresh_token)
    // Doppelte Erneuerung (Kulanz): s1 geht noch, danach ist s1 zwei Generationen alt.
    const r3 = await erneuern(s1.refresh_token)
    assert.equal(r3.statusCode, 200)
    assert.equal((await erneuern(s1.refresh_token)).statusCode, 401)
    // Kulanz abgelaufen:
    await u.db.alsDienst((v) => v.query("update auth.sitzungen set zuletzt_erneuert_am = now() - interval '1 minute'"))
    assert.equal((await erneuern(s2.refresh_token)).statusCode, 401)
    assert.equal((await erneuern(r3.json().refresh_token)).statusCode, 200)
  })

  test('Abmelden beendet Zugriffs- und Refresh-Token sofort', async () => {
    const { email } = await firmaMitNutzer(u.db, 'Alpha')
    const s = await sitzung(email)
    const r = await u.app.inject({ method: 'POST', url: '/api/auth/abmelden', headers: bearer(s.access_token), payload: {} })
    assert.equal(r.statusCode, 200)
    assert.equal((await nutzer(s.access_token)).statusCode, 401)
    const e = await u.app.inject({ method: 'POST', url: '/api/auth/erneuern', payload: { refresh_token: s.refresh_token } })
    assert.equal(e.statusCode, 401)
  })

  test('"andere abmelden" laesst nur die eigene Sitzung bestehen', async () => {
    const { email } = await firmaMitNutzer(u.db, 'Alpha')
    const hier = await sitzung(email)
    const dort = await sitzung(email)
    await u.app.inject({ method: 'POST', url: '/api/auth/abmelden', headers: bearer(hier.access_token), payload: { bereich: 'andere' } })
    assert.equal((await nutzer(hier.access_token)).statusCode, 200)
    assert.equal((await nutzer(dort.access_token)).statusCode, 401)
  })

  test('Passwort aendern: altes geht nicht mehr, andere Sitzungen enden', async () => {
    const { email } = await firmaMitNutzer(u.db, 'Alpha')
    const hier = await sitzung(email)
    const dort = await sitzung(email)
    const kurz = await u.app.inject({ method: 'POST', url: '/api/auth/passwort', headers: bearer(hier.access_token), payload: { passwort: '12345' } })
    assert.equal(kurz.statusCode, 400)
    const r = await u.app.inject({ method: 'POST', url: '/api/auth/passwort', headers: bearer(hier.access_token), payload: { passwort: 'ganz-neu-123' } })
    assert.equal(r.statusCode, 200)
    assert.equal((await nutzer(hier.access_token)).statusCode, 200)
    assert.equal((await nutzer(dort.access_token)).statusCode, 401)
    assert.equal((await anmelden(email)).statusCode, 400)
    assert.equal((await anmelden(email, 'ganz-neu-123')).statusCode, 200)
  })

  test('E-Mail aendern: belegte Adresse wird abgelehnt', async () => {
    const a = await firmaMitNutzer(u.db, 'Alpha')
    const b = await firmaMitNutzer(u.db, 'Beta')
    const s = await sitzung(a.email)
    const belegt = await u.app.inject({ method: 'POST', url: '/api/auth/email', headers: bearer(s.access_token), payload: { email: b.email.toUpperCase() } })
    assert.equal(belegt.statusCode, 409)
    const ok = await u.app.inject({ method: 'POST', url: '/api/auth/email', headers: bearer(s.access_token), payload: { email: 'neu@test.example' } })
    assert.equal(ok.statusCode, 200)
    assert.equal((await anmelden('neu@test.example')).statusCode, 200)
  })
})

describe('Zwei-Faktor-Anmeldung', () => {
  async function zweiFaktorEinrichten(email: string) {
    const s = await sitzung(email)
    const anderes = await sitzung(email)
    const e = await u.app.inject({ method: 'POST', url: '/api/auth/mfa/faktoren', headers: bearer(s.access_token) })
    assert.equal(e.statusCode, 200, e.body)
    const faktor = e.json() as { id: string; status: string; totp: { secret: string; qr_code: string } }
    assert.equal(faktor.status, 'unverified')
    assert.match(faktor.totp.qr_code, /^data:image\/svg\+xml/)
    const falsch = await u.app.inject({
      method: 'POST', url: `/api/auth/mfa/faktoren/${faktor.id}/bestaetigen`, headers: bearer(s.access_token), payload: { code: '000000' },
    })
    assert.equal(falsch.statusCode, 400)
    const b = await u.app.inject({
      method: 'POST', url: `/api/auth/mfa/faktoren/${faktor.id}/bestaetigen`, headers: bearer(s.access_token),
      payload: { code: totpCode(faktor.totp.secret) },
    })
    assert.equal(b.statusCode, 200, b.body)
    return { neu: b.json(), anderes, faktor }
  }

  test('Einrichten hebt die Sitzung auf aal2 und meldet andere Geraete ab', async () => {
    const { email } = await firmaMitNutzer(u.db, 'Alpha')
    const { neu, anderes } = await zweiFaktorEinrichten(email)
    assert.equal(neu.aal, 'aal2')
    assert.equal((await nutzer(neu.access_token)).json().aal, 'aal2')
    assert.equal((await nutzer(anderes.access_token)).statusCode, 401)
  })

  test('Anmeldung verlangt danach den Code, ohne vorher eine Sitzung zu geben', async () => {
    const { email } = await firmaMitNutzer(u.db, 'Alpha')
    const { faktor } = await zweiFaktorEinrichten(email)
    const r = await anmelden(email)
    assert.equal(r.statusCode, 200)
    const schritt1 = r.json()
    assert.equal(schritt1.mfa_erforderlich, true)
    assert.equal(schritt1.access_token, undefined)
    assert.equal(schritt1.refresh_token, undefined)

    const mfa = (code: string, token = schritt1.mfa_token) =>
      u.app.inject({ method: 'POST', url: '/api/auth/mfa', payload: { mfa_token: token, code } })
    assert.equal((await mfa('123456')).statusCode, 400)
    // Der eben beim Einrichten benutzte Code ist verbraucht:
    assert.equal((await mfa(totpCode(faktor.totp.secret))).statusCode, 400)
    // Code einmal erzeugen und wiederverwenden -- neu erzeugt waere er nach
    // einem 30-s-Wechsel ein anderer, legitim gueltiger Code.
    const naechsterCode = totpCode(faktor.totp.secret, 1)
    const ok = await mfa(naechsterCode)
    assert.equal(ok.statusCode, 200, ok.body)
    assert.equal(ok.json().aal, 'aal2')
    // Derselbe Code ein zweites Mal: abgelehnt.
    assert.equal((await mfa(naechsterCode)).statusCode, 400)
    assert.equal((await mfa(totpCode(faktor.totp.secret, 2), 'kaputt')).statusCode, 401)
  })

  test('aktiven Faktor entfernen nur mit aal2-Sitzung', async () => {
    const { email, userId } = await firmaMitNutzer(u.db, 'Alpha')
    const { neu, faktor } = await zweiFaktorEinrichten(email)
    // Kuenstlich eine aal1-Sitzung erzeugen (z. B. Altbestand):
    await u.db.alsDienst((v) => v.query("update auth.sitzungen set aal = 'aal1' where user_id = $1", [userId]))
    const erneuert = await u.app.inject({ method: 'POST', url: '/api/auth/erneuern', payload: { refresh_token: neu.refresh_token } })
    const aal1 = erneuert.json().access_token
    const verboten = await u.app.inject({ method: 'DELETE', url: `/api/auth/mfa/faktoren/${faktor.id}`, headers: bearer(aal1) })
    assert.equal(verboten.statusCode, 403)
    const erlaubt = await u.app.inject({ method: 'DELETE', url: `/api/auth/mfa/faktoren/${faktor.id}`, headers: bearer(neu.access_token) })
    assert.equal(erlaubt.statusCode, 200)
    assert.equal((await anmelden(email)).json().aal, 'aal1')
  })
})

describe('Mandantentrennung ueber die Nutzer-Transaktion', () => {
  test('Nutzer sieht nur die eigene Firma, auth.* ist gesperrt', async () => {
    const a = await firmaMitNutzer(u.db, 'Alpha')
    await firmaMitNutzer(u.db, 'Beta')
    const s = await sitzung(a.email)
    const { pruefeZugriffstoken } = await import('../src/auth/token.ts')
    const claims = await pruefeZugriffstoken(s.access_token, u.konf.jwtGeheimnis)
    const firmen = await u.db.alsNutzer(claims, async (v) => (await v.query('select id from public.unternehmen')).rows)
    assert.deepEqual(firmen.map((f) => f.id), [a.unternehmenId])
    await assert.rejects(u.db.alsNutzer(claims, (v) => v.query('select * from auth.users')), /permission denied/)
  })
})

describe('Schutz gegen Passwort-Raten', () => {
  let eng: Awaited<ReturnType<typeof testUmgebung>>
  before(async () => {
    eng = await testUmgebung({ anmeldeVersucheProMinute: 3 })
  })
  after(() => eng.beenden())

  test('nach zu vielen Versuchen pro Minute: 429', async () => {
    const codes = []
    for (let i = 0; i < 4; i++) {
      const r = await eng.app.inject({ method: 'POST', url: '/api/auth/anmelden', payload: { email: 'x@test.example', passwort: 'y' } })
      codes.push(r.statusCode)
    }
    assert.deepEqual(codes, [400, 400, 400, 429])
  })
})
