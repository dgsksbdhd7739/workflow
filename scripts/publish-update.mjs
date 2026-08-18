// Verpackt den aktuellen dist/-Build als Live-Update-Bundle und laedt es
// ueber die publish-app-update-Edge-Function in den oeffentlichen
// Supabase-Storage-Bucket "app-updates" hoch. Danach erkennt jede laufende
// App-Instanz (siehe src/lib/liveUpdate.ts) beim naechsten Start die neue
// Version und spielt sie automatisch ein -- kein APK-Neubau/-Reinstall
// noetig fuer reine JS/CSS/HTML-Aenderungen.
//
// Voraussetzung: `npm run build` wurde bereits ausgefuehrt (dist/ ist aktuell).
// Aufruf: node scripts/publish-update.mjs

import { createWriteStream, readFileSync, existsSync, mkdtempSync, rmSync, readFileSync as readFileBytes } from 'node:fs'
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

const supabaseUrl = envVars.VITE_SUPABASE_URL
const publishSecret = envVars.PUBLISH_UPDATE_SECRET
if (!supabaseUrl || !publishSecret) {
  console.error('VITE_SUPABASE_URL oder PUBLISH_UPDATE_SECRET fehlt in .env')
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

console.log(`Lade Version ${version} hoch ...`)
const zipBytes = readFileBytes(zipPath)
const res = await fetch(`${supabaseUrl}/functions/v1/publish-app-update`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/zip',
    'x-publish-secret': publishSecret,
    'x-version': version,
  },
  body: zipBytes,
})
const result = await res.json()
if (!res.ok) {
  console.error('Upload fehlgeschlagen:', result)
  rmSync(tmpDir, { recursive: true, force: true })
  process.exit(1)
}

rmSync(tmpDir, { recursive: true, force: true })
console.log(`\nFertig. Version ${version} ist live -- Apps holen sie sich beim naechsten Start automatisch.`)
console.log(result)
