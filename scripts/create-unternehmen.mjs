// Legt eine neue Firma samt erstem Admin-Account an, ueber die
// create-unternehmen-Edge-Function (siehe dort fuer den Hintergrund: es
// gibt bewusst keine Selbstregistrierung, das Provisionieren neuer Firmen
// bleibt manuelle Handarbeit).
//
// Aufruf: node scripts/create-unternehmen.mjs "Firma GmbH" admin@firma.de "Vorname Nachname"
// Das Admin-Passwort wird zufaellig generiert und ausgegeben (der Admin
// muss es beim ersten Login ohnehin aendern, siehe muss_passwort_aendern).

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const projectRoot = path.resolve(import.meta.dirname, '..')

const [firmenname, adminEmail, adminName] = process.argv.slice(2)
if (!firmenname || !adminEmail) {
  console.error('Aufruf: node scripts/create-unternehmen.mjs "Firma GmbH" admin@firma.de "Vorname Nachname"')
  process.exit(1)
}

const envPath = path.join(projectRoot, '.env')
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx), l.slice(idx + 1)]
    }),
)

const supabaseUrl = envVars.VITE_SUPABASE_URL
const provisionSecret = envVars.PROVISION_SECRET
if (!supabaseUrl || !provisionSecret) {
  console.error('VITE_SUPABASE_URL oder PROVISION_SECRET fehlt in .env')
  process.exit(1)
}

const adminPassword = randomBytes(9).toString('base64url')

const res = await fetch(`${supabaseUrl}/functions/v1/create-unternehmen`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-provision-secret': provisionSecret,
  },
  body: JSON.stringify({
    firmenname,
    admin_email: adminEmail,
    admin_password: adminPassword,
    admin_name: adminName ?? '',
  }),
})
const result = await res.json()
if (!res.ok) {
  console.error('Anlegen fehlgeschlagen:', result)
  process.exit(1)
}

console.log(`\nFirma "${firmenname}" angelegt (unternehmen_id: ${result.unternehmen_id}).`)
console.log(`Admin-Login:\n  E-Mail:    ${adminEmail}\n  Passwort:  ${adminPassword}`)
console.log('\nBitte Zugangsdaten sicher an den Kunden uebermitteln -- Passwort muss beim ersten Login geaendert werden.')
