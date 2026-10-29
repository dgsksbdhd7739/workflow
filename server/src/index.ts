import { baueApp } from './app.ts'
import { Datenbank } from './datenbank.ts'
import { ladeKonfiguration } from './konfiguration.ts'

const konf = ladeKonfiguration()
const db = new Datenbank(konf.datenbankUrl)
const app = await baueApp(db, konf)

// Nur lokal lauschen -- erreichbar ist das Backend ausschliesslich ueber Nginx.
await app.listen({ host: '127.0.0.1', port: konf.port })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close()
    await db.schliessen()
    process.exit(0)
  })
}
