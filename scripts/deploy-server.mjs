// Spielt das Backend (server/) auf den VPS: committeten Stand per git archive
// hochladen, Abhaengigkeiten in einem neuen Ordner installieren, Datenbank-
// Migrationen einspielen, umschalten, Dienst neu starten und pruefen. Startet
// der neue Stand nicht, wird automatisch auf den vorherigen zurueckgeschaltet.
//
// Voraussetzung: scripts/vps-setup.sh wurde auf dem Server ausgefuehrt,
// VPS_HOST/VPS_SSH_KEY stehen in .env. Aufruf: npm run deploy-server

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const envVars = Object.fromEntries(
  readFileSync(path.join(projectRoot, '.env'), 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const host = envVars.VPS_HOST
const user = envVars.VPS_USER || 'root'
const keyPath = envVars.VPS_SSH_KEY
if (!host || !keyPath || !existsSync(keyPath)) {
  console.error('VPS_HOST/VPS_SSH_KEY fehlt in .env oder der Schluessel existiert nicht.')
  process.exit(1)
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: projectRoot, ...opts })
const ssh = (befehl) => run('ssh', ['-i', keyPath, `${user}@${host}`, befehl])

const offen = execFileSync('git', ['status', '--porcelain', '--', 'server'], { cwd: projectRoot, encoding: 'utf-8' }).trim()
if (offen) {
  console.error('server/ hat nicht committete Aenderungen -- deployt wird nur der committete Stand:\n' + offen)
  process.exit(1)
}

console.log('Typpruefung server/ ...')
run('npx', ['tsc', '--noEmit'], { cwd: path.join(projectRoot, 'server'), shell: process.platform === 'win32' })

const tmp = mkdtempSync(path.join(tmpdir(), 'workflow-server-'))
const archiv = path.join(tmp, 'server.tar')
const stand = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectRoot, encoding: 'utf-8' }).trim()
run('git', ['archive', '--format=tar', '-o', archiv, 'HEAD', 'server'])

console.log(`Lade Stand ${stand} hoch ...`)
run('scp', ['-q', '-i', keyPath, archiv, `${user}@${host}:/tmp/workflow-server.tar`])
rmSync(tmp, { recursive: true, force: true })

ssh(`set -e
cd /opt/workflow
rm -rf server-neu entpackt && mkdir entpackt
tar -xf /tmp/workflow-server.tar -C entpackt && rm /tmp/workflow-server.tar
mv entpackt/server server-neu && rmdir entpackt
echo ${stand} > server-neu/STAND
cd server-neu && npm ci --omit=dev --no-audit --no-fund --loglevel=error && cd ..
chmod 755 server-neu/scripts/migrieren.sh
echo 'Migrationen ...'
(cd /tmp && sudo -u postgres /opt/workflow/server-neu/scripts/migrieren.sh workflow)
rm -rf server-alt
if [ -d server ]; then mv server server-alt; fi
mv server-neu server
chown -R root:root server && chmod -R o+rX server
systemctl restart workflow-server
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:3000/api/gesund >/dev/null; then echo "Backend laeuft (Stand $(cat server/STAND))."; exit 0; fi
  sleep 1
done
echo 'Backend startet nicht -- schalte zurueck auf den vorherigen Stand.' >&2
journalctl -u workflow-server -n 30 --no-pager >&2
if [ -d server-alt ]; then rm -rf server-kaputt; mv server server-kaputt; mv server-alt server; systemctl restart workflow-server; fi
exit 1`)
console.log('\nFertig.')
