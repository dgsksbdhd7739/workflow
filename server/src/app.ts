import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import type { Datenbank } from './datenbank.ts'
import type { Konfiguration } from './konfiguration.ts'
import { AnfrageFehler } from './anfrage.ts'
import { authRouten } from './auth/routen.ts'
import { datenRouten } from './daten/routen.ts'
import { ladeSchema } from './daten/schema.ts'
import { dateiRouten } from './dateien/routen.ts'
import { funktionsRouten } from './funktionen/routen.ts'
import { Lauscher } from './live/lauscher.ts'
import { liveRouten } from './live/routen.ts'
import { ChatPush } from './push/fcm.ts'

export async function baueApp(db: Datenbank, konf: Konfiguration) {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' },
    // Keine Zugriffsprotokolle mit IP-Adressen im Journal -- die Datenschutz-
    // erklaerung sagt 14 Tage zu, das leisten nur die rotierten Nginx-Logs.
    // Fehler werden weiterhin protokolliert.
    disableRequestLogging: true,
    // Nginx sitzt davor; die echte Client-IP (fuer Rate-Limits) steht in X-Forwarded-For.
    trustProxy: '127.0.0.1',
    bodyLimit: 1024 * 1024,
  })

  await app.register(cors, {
    origin: konf.erlaubteUrspruenge,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
  // Global aus; einzelne Routen (Anmeldung, 2FA) aktivieren es ueber config.rateLimit.
  await app.register(rateLimit, { global: false })
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } })

  app.setErrorHandler((fehler, req, antwort) => {
    if (fehler instanceof AnfrageFehler) {
      return antwort.status(fehler.status).send({ error: fehler.message, code: fehler.code })
    }
    const status = (fehler as { statusCode?: number }).statusCode
    if (status && status >= 400 && status < 500) {
      const meldung =
        status === 429 ? 'Zu viele Versuche. Bitte kurz warten.'
        : status === 413 ? 'Die Datei ist zu groß.'
        : (fehler as Error).message
      return antwort.status(status).send({ error: meldung })
    }
    req.log.error(fehler)
    return antwort.status(500).send({ error: 'Interner Fehler. Bitte später erneut versuchen.' })
  })

  // Datenbank-Benachrichtigungen (Chat-Echtzeit, Chat-Push).
  const lauscher = new Lauscher(konf.datenbankUrl, ['live', 'chat_push'])
  lauscher.on('verbindungsfehler', (fehler) => app.log.error({ err: fehler }, 'LISTEN-Verbindung fehlgeschlagen'))
  const push = new ChatPush(db, app.log)
  await push.laden(konf.firebaseDienstkontoDatei)
  lauscher.on('chat_push', (e: { nachricht_id?: string }) => {
    if (e.nachricht_id) push.nachrichtVersenden(e.nachricht_id).catch((f) => app.log.error({ err: f }, 'Chat-Push fehlgeschlagen'))
  })
  await lauscher.starten()
  app.addHook('onClose', () => lauscher.beenden())

  app.get('/api/gesund', async () => ({ ok: true }))
  authRouten(app, db, konf)
  datenRouten(app, db, konf, await ladeSchema(db))
  dateiRouten(app, db, konf)
  funktionsRouten(app, db, konf)
  liveRouten(app, db, konf, lauscher)

  return app
}
