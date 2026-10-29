// Verpackt den aktuellen dist/-Build als Live-Update-Bundle und legt es per
// scp auf dem eigenen VPS unter /var/www/updates ab (Nginx liefert es unter
// <UPDATE_BASIS_URL>/ aus). Danach erkennt jede laufende App-Instanz (siehe
// src/lib/liveUpdate.ts) beim naechsten Start die neue Version und spielt sie
// automatisch ein -- kein APK-Neubau/-Reinstall noetig fuer reine
// JS/CSS/HTML-Aenderungen.
//
// Voraussetzung: `npm run build` wurde bereits ausgefuehrt (dist/ ist aktuell),
// VPS_HOST/VPS_SSH_KEY stehen in .env.
// Aufruf: node scripts/publish-update.mjs

import { execFileSync } from 'node:child_process'
import { createWriteStream, readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ZipArchive } = require('archiver')

const projectRoot = path.resolve(import.meta.dirname, '..')
const distDir = path.join(projectRoot, 'dist')

if (!existsSync(distDir)) {
  console.error('dist/ nicht gefunden. Zuerst "npm run build" ausfuehren.')
  process.exit(1)
}

// .env von Hand einlesen (kein dotenv als Abhaengigkeit noetig).
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
// Oeffentliche Adresse, unter der Nginx /var/www/updates ausliefert (siehe
// scripts/vps-setup.sh). Muss zur Manifest-URL in src/lib/liveUpdate.ts passen.
const basisUrl = (envVars.UPDATE_BASIS_URL || 'https://217-154-200-72.sslip.io/updates').replace(/\/$/, '')
if (!host || !keyPath || !existsSync(keyPath)) {
  console.error('VPS_HOST/VPS_SSH_KEY fehlt in .env oder der Schluessel existiert nicht.')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'))
const version = pkg.version
if (!version || version === '0.0.0') {
  console.error(`package.json "version" ist "${version}" - bitte vor dem Publizieren eine echte Version setzen.`)
  process.exit(1)
}

const tmpDir = mkdtempSync(path.join(tmpdir(), 'workflow-update-'))
const zipPath = path.join(tmpDir, `dist-${version}.zip`)

console.log(`Packe dist/ als dist-${version}.zip ...`)
await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath)
  const archive = new ZipArchive({ zlib: { level: 9 } })
  output.on('close', resolve)
  archive.on('error', reject)
  archive.pipe(output)
  archive.directory(distDir, false)
  archive.finalize()
})

console.log(`Lade Version ${version} auf den Server ...`)
const ziel = `${user}@${host}`
const ssh = (befehl) => execFileSync('ssh', ['-i', keyPath, ziel, befehl], { stdio: 'inherit' })
const scp = (quelle, zielPfad) => execFileSync('scp', ['-q', '-i', keyPath, quelle, `${ziel}:${zielPfad}`], { stdio: 'inherit' })

// Erst das Zip, dann das Manifest -- und dieses per mv atomar ersetzen, damit
// kein Geraet ein Manifest sieht, dessen Zip noch nicht vollstaendig da ist.
const manifest = { version, url: `${basisUrl}/dist-${version}.zip` }
const manifestPfad = path.join(tmpDir, 'latest.json')
writeFileSync(manifestPfad, JSON.stringify(manifest))
try {
  ssh('mkdir -p /var/www/updates')
  scp(zipPath, `/var/www/updates/dist-${version}.zip`)
  scp(manifestPfad, '/var/www/updates/latest.json.neu')
  ssh('mv /var/www/updates/latest.json.neu /var/www/updates/latest.json && chown -R www-data:www-data /var/www/updates')
} catch (fehler) {
  console.error('Upload fehlgeschlagen:', fehler.message)
  rmSync(tmpDir, { recursive: true, force: true })
  process.exit(1)
}

rmSync(tmpDir, { recursive: true, force: true })
console.log(`\nFertig. Version ${version} ist live -- Apps holen sie sich beim naechsten Start automatisch.`)
console.log(manifest)
