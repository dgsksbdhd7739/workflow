import { createHmac, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { Datenbank } from '../datenbank.ts'
import type { Konfiguration } from '../konfiguration.ts'
import { AnfrageFehler, erfordertAnmeldung, nutzerVon } from '../anfrage.ts'
import { pgFehlerAlsAntwort } from '../daten/routen.ts'

// Dateien liegen unter <dateienVerzeichnis>/<bucket>/<pfad>, die Metadaten in
// storage.objects. Ob jemand hochladen, lesen oder loeschen darf, entscheiden
// die bestehenden RLS-Policies auf storage.objects (aus der Supabase-Zeit):
// das Backend fuehrt die jeweilige Zeilen-Operation im Kontext des Nutzers aus
// und fasst die Datei nur an, wenn die Policy sie zugelassen hat.

const BUCKETS = new Set(['mangel-fotos', 'plaene', 'projekt-logos', 'dokumente', 'unternehmen-logos', 'tagesbericht-vorlagen'])

// Wie bisher in der App (Signed-URLs), hoechstens eine Woche.
const MAX_GUELTIG_SEKUNDEN = 7 * 24 * 3600

export function pruefePfad(pfad: unknown): string {
  if (
    typeof pfad !== 'string' ||
    pfad.length === 0 ||
    pfad.length > 1024 ||
    !/^[A-Za-z0-9._\- /]+$/.test(pfad) ||
    pfad.split('/').some((teil) => teil === '' || teil === '.' || teil === '..' || teil.trim() !== teil)
  ) {
    throw new AnfrageFehler(400, 'Ungültiger Dateipfad.', 'pfad_ungueltig')
  }
  return pfad
}

function pruefeBucket(bucket: string) {
  if (!BUCKETS.has(bucket)) throw new AnfrageFehler(404, `Unbekannter Speicherbereich "${bucket}".`)
  return bucket
}

export function dateiRouten(app: FastifyInstance, db: Datenbank, konf: Konfiguration) {
  const angemeldet = erfordertAnmeldung(db, konf)
  const signaturSchluessel = createHmac('sha256', konf.jwtGeheimnis).update('workflow-datei-links').digest()

  const dateiPfad = (bucket: string, pfad: string) => {
    const basis = path.resolve(konf.dateienVerzeichnis, bucket)
    const ziel = path.resolve(basis, ...pfad.split('/'))
    // Doppelte Absicherung zusaetzlich zu pruefePfad: nie ausserhalb des Buckets.
    if (!ziel.startsWith(basis + path.sep)) throw new AnfrageFehler(400, 'Ungültiger Dateipfad.', 'pfad_ungueltig')
    return ziel
  }

  const signatur = (bucket: string, pfad: string, ablauf: number) =>
    createHmac('sha256', signaturSchluessel).update(`${bucket}\n${pfad}\n${ablauf}`).digest('base64url')

  // Upload: Rohdaten im Body, Typ im Content-Type. Eigener Kontext, damit hier
  // jeder Content-Type als Buffer ankommt (auch eine hochgeladene .json-Datei).
  app.register(async (bereich) => {
    bereich.removeAllContentTypeParsers()
    bereich.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: konf.maxUploadBytes }, (_req, body, fertig) =>
      fertig(null, body),
    )

    bereich.put<{ Params: { bucket: string; '*': string } }>(
      '/api/dateien/:bucket/*',
      { preHandler: angemeldet },
      async (req) => {
        const nutzer = nutzerVon(req)
        const bucket = pruefeBucket(req.params.bucket)
        const pfad = pruefePfad(req.params['*'])
        const inhalt = req.body as Buffer
        if (!Buffer.isBuffer(inhalt) || inhalt.length === 0) throw new AnfrageFehler(400, 'Datei ist leer.')
        const mimetype = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim().slice(0, 100)
        const ziel = dateiPfad(bucket, pfad)
        try {
          await db.alsNutzer(nutzer, async (v) => {
            // Policy-Pruefung (insert) -- erst danach wird geschrieben.
            await v.query(
              `insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)`,
              [bucket, pfad, nutzer.sub, { size: inhalt.length, mimetype }],
            )
            await mkdir(path.dirname(ziel), { recursive: true })
            const temp = `${ziel}.${process.pid}.${Date.now()}.tmp`
            await writeFile(temp, inhalt, { flag: 'wx' })
            await rename(temp, ziel)
          })
        } catch (fehler) {
          throw pgFehlerAlsAntwort(fehler) ?? fehler
        }
        return { path: pfad, fullPath: `${bucket}/${pfad}` }
      },
    )
  })

  // Zeitlich begrenzter Link -- nur wenn der Nutzer die Datei laut Policy sehen darf.
  app.post<{ Params: { bucket: string }; Body: { pfad?: unknown; sekunden?: unknown } }>(
    '/api/dateien/:bucket/signieren',
    { preHandler: angemeldet },
    async (req) => {
      const nutzer = nutzerVon(req)
      const bucket = pruefeBucket(req.params.bucket)
      const pfad = pruefePfad(req.body?.pfad)
      const sekunden = Math.min(Math.max(Number(req.body?.sekunden) || 3600, 1), MAX_GUELTIG_SEKUNDEN)
      const sichtbar = await db.alsNutzer(nutzer, async (v) =>
        (await v.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, pfad])).rowCount,
      )
      if (!sichtbar) throw new AnfrageFehler(404, 'Datei nicht gefunden.', 'datei_unbekannt')
      const ablauf = Math.floor(Date.now() / 1000) + sekunden
      const url = `/api/dateien/laden/${bucket}/${pfad.split('/').map(encodeURIComponent).join('/')}`
      return { signedUrl: `${url}?ablauf=${ablauf}&signatur=${signatur(bucket, pfad, ablauf)}` }
    },
  )

  // Auslieferung ueber signierten Link (ohne Bearer-Token, damit <img>/<iframe>
  // und Downloads funktionieren).
  app.get<{ Params: { bucket: string; '*': string }; Querystring: { ablauf?: string; signatur?: string } }>(
    '/api/dateien/laden/:bucket/*',
    async (req, antwort) => {
      const bucket = pruefeBucket(req.params.bucket)
      const pfad = pruefePfad(req.params['*'])
      const ablauf = Number(req.query.ablauf)
      const erwartet = Buffer.from(signatur(bucket, pfad, ablauf))
      const erhalten = Buffer.from(String(req.query.signatur ?? ''))
      if (
        !Number.isInteger(ablauf) ||
        ablauf < Date.now() / 1000 ||
        erhalten.length !== erwartet.length ||
        !timingSafeEqual(erhalten, erwartet)
      ) {
        throw new AnfrageFehler(403, 'Link ungültig oder abgelaufen.', 'link_ungueltig')
      }
      const ziel = dateiPfad(bucket, pfad)
      const meta = await db.alsDienst(async (v) =>
        (await v.query<{ metadata: { mimetype?: string } }>(
          'select metadata from storage.objects where bucket_id = $1 and name = $2',
          [bucket, pfad],
        )).rows[0],
      )
      const info = await stat(ziel).catch(() => null)
      if (!meta || !info) throw new AnfrageFehler(404, 'Datei nicht gefunden.', 'datei_unbekannt')
      const dateiname = path.basename(pfad).replace(/^\d+-/, '')
      return antwort
        .header('content-type', meta.metadata?.mimetype || 'application/octet-stream')
        .header('content-length', info.size)
        .header('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(dateiname)}`)
        .header('cache-control', 'private, max-age=3600')
        .header('x-content-type-options', 'nosniff')
        .send(createReadStream(ziel))
    },
  )

  app.post<{ Params: { bucket: string }; Body: { pfade?: unknown } }>(
    '/api/dateien/:bucket/loeschen',
    { preHandler: angemeldet },
    async (req) => {
      const nutzer = nutzerVon(req)
      const bucket = pruefeBucket(req.params.bucket)
      if (!Array.isArray(req.body?.pfade) || req.body.pfade.length > 1000) throw new AnfrageFehler(400, 'pfade fehlt.')
      const pfade = req.body.pfade.map(pruefePfad)
      // Policy-Pruefung (delete): geloescht wird nur, was die Policy freigibt.
      const geloescht = await db.alsNutzer(nutzer, async (v) =>
        (await v.query<{ name: string }>(
          'delete from storage.objects where bucket_id = $1 and name = any($2) returning name',
          [bucket, pfade],
        )).rows.map((r) => r.name),
      )
      await Promise.all(geloescht.map((p) => rm(dateiPfad(bucket, p), { force: true })))
      return { data: geloescht.map((name) => ({ name, bucket_id: bucket })) }
    },
  )
}
