import os from 'node:os'
import { readFile, statfs } from 'node:fs/promises'
import type { FastifyBaseLogger } from 'fastify'
import type { Datenbank } from '../datenbank.ts'

// Erfasst jede Minute CPU, RAM, Festplatte und Netzwerk des Servers in
// betrieb.messwerte (Migration 0006) fuer die Verlaufskurven der Seite
// "Serverzustand". Nur Node-Bordmittel und /proc -- kein Zusatzprogramm,
// kein offener Port.

const AUFBEWAHRUNG = '8 days'

interface CpuZeiten {
  ruhe: number
  gesamt: number
}

function cpuZeiten(): CpuZeiten {
  let ruhe = 0
  let gesamt = 0
  for (const { times: t } of os.cpus()) {
    ruhe += t.idle
    gesamt += t.user + t.nice + t.sys + t.idle + t.irq
  }
  return { ruhe, gesamt }
}

function auslastung(vorher: CpuZeiten, nachher: CpuZeiten) {
  const gesamt = nachher.gesamt - vorher.gesamt
  if (gesamt <= 0) return 0
  return Math.round((1 - (nachher.ruhe - vorher.ruhe) / gesamt) * 1000) / 10
}

/** CPU-Auslastung in Prozent ueber ein kurzes Messfenster. */
export async function cpuMessen(ms = 500) {
  const vorher = cpuZeiten()
  await new Promise((fertig) => setTimeout(fertig, ms))
  return auslastung(vorher, cpuZeiten())
}

export async function platteMessen(pfad: string) {
  const s = await statfs(pfad)
  return { belegt: (s.blocks - s.bfree) * s.bsize, gesamt: s.blocks * s.bsize }
}

export function ramMessen() {
  // freemem liest unter Linux MemAvailable, also ohne den Seiten-Cache.
  const gesamt = os.totalmem()
  return { belegt: gesamt - os.freemem(), gesamt }
}

/** Summe der empfangenen/gesendeten Bytes aller Netzwerkkarten ausser lo; null ausserhalb von Linux. */
async function netzZaehler(): Promise<{ rein: number; raus: number } | null> {
  try {
    const zeilen = (await readFile('/proc/net/dev', 'utf8')).split('\n').slice(2)
    let rein = 0
    let raus = 0
    for (const zeile of zeilen) {
      const [name, werte] = zeile.split(':')
      if (!werte || name.trim() === 'lo') continue
      const felder = werte.trim().split(/\s+/).map(Number)
      rein += felder[0]
      raus += felder[8]
    }
    return { rein, raus }
  } catch {
    return null
  }
}

/** 500er-Fehler des Backends (seit dem letzten Start) fuer die Kennzahl "Fehler 24 h". */
export const serverFehler = {
  zeitpunkte: [] as number[],
  vermerken() {
    this.zeitpunkte.push(Date.now())
    this.aufraeumen()
  },
  anzahl() {
    this.aufraeumen()
    return this.zeitpunkte.length
  },
  aufraeumen() {
    const grenze = Date.now() - 24 * 3600 * 1000
    while (this.zeitpunkte.length && this.zeitpunkte[0] < grenze) this.zeitpunkte.shift()
  },
}

export class Messung {
  private cpuVorher = cpuZeiten()
  private netzVorher: { rein: number; raus: number } | null = null
  private zeitgeber: NodeJS.Timeout | undefined
  private readonly db: Datenbank
  private readonly log: FastifyBaseLogger
  private readonly plattenPfad: string

  constructor(db: Datenbank, log: FastifyBaseLogger, plattenPfad: string) {
    this.db = db
    this.log = log
    this.plattenPfad = plattenPfad
  }

  starten(intervallMs = 60_000) {
    netzZaehler().then((n) => (this.netzVorher = n))
    this.zeitgeber = setInterval(() => {
      this.erfassen().catch((fehler) => this.log.error({ err: fehler }, 'Messwerte konnten nicht gespeichert werden'))
    }, intervallMs)
    this.zeitgeber.unref()
  }

  beenden() {
    clearInterval(this.zeitgeber)
  }

  async erfassen() {
    const cpuJetzt = cpuZeiten()
    const cpu = auslastung(this.cpuVorher, cpuJetzt)
    this.cpuVorher = cpuJetzt
    const netz = await netzZaehler()
    const vorher = this.netzVorher
    this.netzVorher = netz
    // Zaehler springen nach einem Neustart der Netzwerkkarte zurueck -- dann keinen Wert.
    const rein = netz && vorher && netz.rein >= vorher.rein ? netz.rein - vorher.rein : null
    const raus = netz && vorher && netz.raus >= vorher.raus ? netz.raus - vorher.raus : null
    const ram = ramMessen()
    const platte = await platteMessen(this.plattenPfad)
    await this.db.alsDienst(async (v) => {
      await v.query(
        `insert into betrieb.messwerte
           (cpu_prozent, ram_belegt, ram_gesamt, platte_belegt, platte_gesamt, netz_rein, netz_raus, last_1min)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (zeit) do nothing`,
        [cpu, ram.belegt, ram.gesamt, platte.belegt, platte.gesamt, rein, raus, os.loadavg()[0]],
      )
      await v.query(`delete from betrieb.messwerte where zeit < now() - interval '${AUFBEWAHRUNG}'`)
    })
  }
}
