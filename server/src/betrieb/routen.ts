import os from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import type { FastifyInstance } from 'fastify'
import type { Datenbank } from '../datenbank.ts'
import type { Konfiguration } from '../konfiguration.ts'
import { AnfrageFehler, erfordertAnmeldung, nutzerVon } from '../anfrage.ts'
import { cpuMessen, platteMessen, ramMessen, serverFehler } from './messung.ts'

// GET /api/betrieb/serverzustand -- Daten fuer die Seite "Serverzustand" der
// Plattform-Verwaltung. Nur fuer Plattform-Admins (Tabelle plattform_admins),
// nicht fuer Firmen-Admins: Die Werte betreffen den ganzen Server.

const DIENSTE = [
  { name: 'workflow-server', label: 'WorkFlow-Backend' },
  { name: 'postgresql', label: 'Datenbank' },
  { name: 'nginx', label: 'Webserver' },
  { name: 'workflow-backup.timer', label: 'Nächtliche Sicherung' },
  { name: 'certbot.timer', label: 'Zertifikat-Erneuerung' },
]

const ZEITRAEUME = {
  '24h': { dauer: '24 hours', raster: '10 minutes', rasterSekunden: 600 },
  '7d': { dauer: '7 days', raster: '1 hour', rasterSekunden: 3600 },
} as const

function befehl(datei: string, argumente: string[]): Promise<string | null> {
  return new Promise((fertig) => {
    execFile(datei, argumente, { timeout: 3000 }, (fehler, ausgabe) => {
      // systemctl is-active endet mit Code 3, sobald ein Dienst nicht laeuft -- die Ausgabe gilt trotzdem.
      fertig(ausgabe ? ausgabe.toString() : fehler ? null : '')
    })
  })
}

async function diensteStatus() {
  const ausgabe = await befehl('systemctl', ['is-active', ...DIENSTE.map((d) => d.name)])
  if (ausgabe == null) return null
  const zeilen = ausgabe.trim().split('\n')
  return DIENSTE.map((d, i) => ({ ...d, zustand: zeilen[i]?.trim() || 'unbekannt' }))
}

/**
 * Letzte Sicherung: das Sicherungsskript (scripts/vps-setup.sh) schreibt
 * sicherung.json neben die Dateiablage; der naechste Lauf kommt vom Timer.
 */
async function sicherungStatus(dateienVerzeichnis: string) {
  let letzte: { zeit?: string; ok?: boolean; db_bytes?: number; dateien_bytes?: number } | null = null
  try {
    letzte = JSON.parse(await readFile(path.join(path.dirname(dateienVerzeichnis), 'sicherung.json'), 'utf8'))
  } catch {
    letzte = null
  }
  const naechste = await befehl('systemctl', ['show', 'workflow-backup.timer', '-p', 'NextElapseUSecRealtime', '--value', '--timestamp=unix'])
  const sekunden = naechste?.trim().startsWith('@') ? Number(naechste.trim().slice(1)) : NaN
  return {
    zuletzt_am: letzte?.zeit ?? null,
    ok: letzte?.ok ?? null,
    db_bytes: letzte?.db_bytes ?? null,
    dateien_bytes: letzte?.dateien_bytes ?? null,
    naechste_am: Number.isFinite(sekunden) && sekunden > 0 ? new Date(sekunden * 1000).toISOString() : null,
  }
}

/** Ablaufdatum des HTTPS-Zertifikats, gelesen ueber eine TLS-Verbindung zu Nginx auf diesem Server. */
function zertifikatAblauf(hostname: string): Promise<string | null> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hostname)) return Promise.resolve(null)
  return new Promise((fertig) => {
    const s = tls.connect({ host: '127.0.0.1', port: 443, servername: hostname, rejectUnauthorized: false, timeout: 2000 })
    const ende = (wert: string | null) => {
      s.destroy()
      fertig(wert)
    }
    s.once('secureConnect', () => {
      const gueltig = s.getPeerCertificate()?.valid_to
      ende(gueltig ? new Date(gueltig).toISOString() : null)
    })
    s.once('error', () => ende(null))
    s.once('timeout', () => ende(null))
  })
}

async function verzeichnisGroesse(ordner: string): Promise<{ bytes: number; anzahl: number }> {
  let bytes = 0
  let anzahl = 0
  let eintraege
  try {
    eintraege = await readdir(ordner, { withFileTypes: true })
  } catch {
    return { bytes, anzahl }
  }
  for (const e of eintraege) {
    const voll = path.join(ordner, e.name)
    if (e.isDirectory()) {
      const unter = await verzeichnisGroesse(voll)
      bytes += unter.bytes
      anzahl += unter.anzahl
    } else if (e.isFile()) {
      bytes += (await stat(voll)).size
      anzahl += 1
    }
  }
  return { bytes, anzahl }
}

/** Haelt teure Werte (Verzeichnis durchlaufen, TLS-Verbindung) eine Weile vor. */
function zwischenspeicher<T>(gueltigMs: number, laden: () => Promise<T>) {
  let wert: { daten: Promise<T>; bis: number } | null = null
  return () => {
    if (!wert || wert.bis < Date.now()) wert = { daten: laden(), bis: Date.now() + gueltigMs }
    return wert.daten
  }
}

export function betriebRouten(app: FastifyInstance, db: Datenbank, konf: Konfiguration) {
  const angemeldet = erfordertAnmeldung(db, konf)
  const dateienGroesse = zwischenspeicher(10 * 60_000, () => verzeichnisGroesse(konf.dateienVerzeichnis))
  const zertifikate = new Map<string, () => Promise<string | null>>()

  app.get<{ Querystring: { zeitraum?: string } }>('/api/betrieb/serverzustand', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    const zeitraum = ZEITRAEUME[req.query.zeitraum === '7d' ? '7d' : '24h']

    const { berechtigt } = (
      await db.alsDienst((v) => v.query<{ berechtigt: boolean }>('select public.ist_plattform_admin_id($1) as berechtigt', [nutzer.sub]))
    ).rows[0]
    if (!berechtigt) throw new AnfrageFehler(403, 'Nur für die Plattform-Verwaltung.')

    const hostname = req.hostname.replace(/:\d+$/, '')
    if (!zertifikate.has(hostname)) zertifikate.set(hostname, zwischenspeicher(3600_000, () => zertifikatAblauf(hostname)))

    const [cpu, platte, dienste, sicherung, zertifikat, dateien, daten] = await Promise.all([
      cpuMessen(),
      platteMessen(konf.dateienVerzeichnis),
      diensteStatus(),
      sicherungStatus(konf.dateienVerzeichnis),
      zertifikate.get(hostname)!(),
      dateienGroesse(),
      db.alsDienst(async (v) => {
        const kennzahlen = await v.query(`
          select pg_database_size(current_database()) as datenbank_bytes,
                 (select count(*) from public.unternehmen) as firmen,
                 (select count(*) from auth.users) as nutzer,
                 (select count(*) from auth.sitzungen where beendet_am is null and laeuft_ab_am > now()) as sitzungen,
                 (select count(distinct user_id) from auth.sitzungen
                   where beendet_am is null and zuletzt_erneuert_am > now() - interval '1 hour') as aktiv_letzte_stunde`)
        const verlauf = await v.query(
          `select date_bin($1::interval, zeit, timestamptz '2000-01-01') as zeit,
                  round(avg(cpu_prozent)::numeric, 1) as cpu,
                  round(max(cpu_prozent)::numeric, 1) as cpu_max,
                  round(avg(ram_belegt::numeric / ram_gesamt * 100), 1) as ram,
                  round(max(platte_belegt::numeric / platte_gesamt * 100), 1) as platte,
                  sum(netz_rein) as netz_rein,
                  sum(netz_raus) as netz_raus
             from betrieb.messwerte
            where zeit > now() - $2::interval
            group by 1
            order by 1`,
          [zeitraum.raster, zeitraum.dauer],
        )
        return { kennzahlen: kennzahlen.rows[0], verlauf: verlauf.rows }
      }),
    ])

    const ram = ramMessen()
    return {
      erfasst_am: new Date().toISOString(),
      server: {
        kerne: os.cpus().length,
        cpu_prozent: cpu,
        last: os.loadavg().map((l) => Math.round(l * 100) / 100),
        ram_belegt: ram.belegt,
        ram_gesamt: ram.gesamt,
        platte_belegt: platte.belegt,
        platte_gesamt: platte.gesamt,
        laufzeit_s: Math.round(os.uptime()),
        backend_laufzeit_s: Math.round(process.uptime()),
        backend_ram: process.memoryUsage().rss,
        node_version: process.version,
      },
      dienste,
      sicherung,
      zertifikat_laeuft_ab_am: zertifikat,
      speicher: { datenbank_bytes: daten.kennzahlen.datenbank_bytes, dateien_bytes: dateien.bytes, dateien_anzahl: dateien.anzahl },
      nutzung: {
        firmen: daten.kennzahlen.firmen,
        nutzer: daten.kennzahlen.nutzer,
        sitzungen: daten.kennzahlen.sitzungen,
        aktiv_letzte_stunde: daten.kennzahlen.aktiv_letzte_stunde,
      },
      fehler_24h: serverFehler.anzahl(),
      raster_sekunden: zeitraum.rasterSekunden,
      verlauf: daten.verlauf,
    }
  })
}
