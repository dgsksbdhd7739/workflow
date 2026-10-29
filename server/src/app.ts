import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import type { Datenbank } from './datenbank.ts'
import type { Konfiguration } from './konfiguration.ts'
import { AnfrageFehler } from './anfrage.ts'
import { authRouten } from './auth/routen.ts'
import { datenRouten } from './daten/routen.ts'
import { ladeSchema } from './daten/schema.ts'

export async function baueApp(db: Datenbank, konf: Konfiguration) {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' },
    // Nginx sitzt davor; die echte Client-IP (fuer Rate-Limits) steht in X-Forwarded-For.
    trustProxy: '127.0.0.1',
    bodyLimit: 1024 * 1024,
  })

  await app.register(cors, {
    origin: konf.erlaubteUrspruenge,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  })
  // Global aus; einzelne Routen (Anmeldung, 2FA) aktivieren es ueber config.rateLimit.
  await app.register(rateLimit, { global: false })

  app.setErrorHandler((fehler, req, antwort) => {
    if (fehler instanceof AnfrageFehler) {
      return antwort.status(fehler.status).send({ error: fehler.message, code: fehler.code })
    }
    const status = (fehler as { statusCode?: number }).statusCode
    if (status && status >= 400 && status < 500) {
      const meldung = status === 429 ? 'Zu viele Versuche. Bitte kurz warten.' : (fehler as Error).message
      return antwort.status(status).send({ error: meldung })
    }
    req.log.error(fehler)
    return antwort.status(500).send({ error: 'Interner Fehler. Bitte später erneut versuchen.' })
  })

  app.get('/api/gesund', async () => ({ ok: true }))
  authRouten(app, db, konf)
  datenRouten(app, db, konf, await ladeSchema(db))

  return app
}
