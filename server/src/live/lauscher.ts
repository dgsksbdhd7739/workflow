import { EventEmitter } from 'node:events'
import pg from 'pg'

/**
 * Eigene, dauerhafte Postgres-Verbindung fuer LISTEN auf die Kanaele, die
 * Trigger per pg_notify bedienen (siehe 0001_basis.sql):
 *   live      -> Chat-Echtzeit   (Payload: tabelle, ereignis, id, unternehmen_id, projekt_id)
 *   chat_push -> Push-Versand    (Payload: nachricht_id)
 * Bricht die Verbindung ab, wird nach kurzer Pause neu verbunden.
 */
export class Lauscher extends EventEmitter {
  private client: pg.Client | null = null
  private beendet = false
  private readonly url: string
  private readonly kanaele: string[]

  constructor(url: string, kanaele: string[]) {
    super()
    this.url = url
    this.kanaele = kanaele
  }

  async starten() {
    if (this.beendet) return
    const client = new pg.Client({ connectionString: this.url })
    client.on('notification', (n) => {
      try {
        this.emit(n.channel, JSON.parse(n.payload ?? '{}'))
      } catch {
        // Ungueltiges Payload ignorieren -- kommt nur aus eigenen Triggern.
      }
    })
    client.on('error', () => this.neuVerbinden(client))
    client.on('end', () => this.neuVerbinden(client))
    try {
      await client.connect()
      for (const k of this.kanaele) await client.query(`listen ${k}`)
      this.client = client
    } catch (fehler) {
      this.emit('verbindungsfehler', fehler)
      this.neuVerbinden(client)
    }
  }

  private neuVerbinden(alt: pg.Client) {
    if (this.client && this.client !== alt) return
    this.client = null
    alt.removeAllListeners()
    alt.end().catch(() => {})
    if (!this.beendet) setTimeout(() => void this.starten(), 2000).unref()
  }

  async beenden() {
    this.beendet = true
    const c = this.client
    this.client = null
    c?.removeAllListeners()
    await c?.end().catch(() => {})
  }
}
