// Baut das Projekt und laedt Root-SPA (dist/) sowie Landing-Page (landing/)
// per scp auf den eigenen VPS hoch -- ersetzt die beiden Vercel-Deploys
// ("workflow-app" und "landing") aus der alten Pipeline.
//
// Voraussetzung: VPS_HOST/VPS_SSH_KEY (und optional VPS_USER) in .env gesetzt,
// der hinterlegte Key hat bereits Zugriff auf /var/www/app und /var/www/landing
// (siehe Nginx-Setup auf dem Server). Aufruf: npm run deploy-vps
//
// Deployed KEINE Nginx-Configs/Zertifikate -- die werden einmalig manuell
// eingerichtet, dieses Skript aktualisiert nur die ausgelieferten Dateien.

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')

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

const host = envVars.VPS_HOST
const user = envVars.VPS_USER || 'root'
const keyPath = envVars.VPS_SSH_KEY
if (!host || !keyPath) {
  console.error('VPS_HOST oder VPS_SSH_KEY fehlt in .env - siehe .env.example.')
  process.exit(1)
}
if (!existsSync(keyPath)) {
  console.error(`SSH-Key nicht gefunden unter: ${keyPath}`)
  process.exit(1)
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

console.log('Baue Projekt (npm run build) ...')
run('npm', ['run', 'build'])

const distDir = path.join(projectRoot, 'dist')
const landingDir = path.join(projectRoot, 'landing')

console.log('Lade Root-SPA (dist/) auf den Server ...')
run('scp', ['-i', keyPath, '-r', `${distDir}/.`, `${user}@${host}:/var/www/app/`])

console.log('Lade Landing-Page hoch ...')
run('scp', ['-i', keyPath, '-r', `${landingDir}/.`, `${user}@${host}:/var/www/landing/`])

console.log('Setze Dateirechte ...')
run('ssh', ['-i', keyPath, `${user}@${host}`, 'chown -R www-data:www-data /var/www/app /var/www/landing'])

console.log('\nFertig. Beide Sites sind aktualisiert:')
console.log('  https://app.workflow-app.de')
console.log('  https://workflow-app.de')
