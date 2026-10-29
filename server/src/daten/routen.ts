import type { FastifyInstance } from 'fastify'
import type { Datenbank } from '../datenbank.ts'
import type { Konfiguration } from '../konfiguration.ts'
import { AnfrageFehler, erfordertAnmeldung, nutzerVon } from '../anfrage.ts'
import { type Abfrage, baueSql } from './abfrage.ts'
import type { Tabelle } from './schema.ts'

// Per RPC aufrufbare Datenbankfunktionen (alle ohne Parameter). Jede neue
// Funktion muss hier bewusst freigegeben werden.
const RPC_FREIGABE = new Set(['meine_aktiven_geraete', 'plattform_unternehmen_uebersicht'])

interface PgFehler {
  code?: string
  message: string
  detail?: string
}

/**
 * Postgres-Fehler in Antworten uebersetzen. Meldungen aus eigenen Triggern
 * (raise exception, z. B. Paket-Limits) sind fuer Nutzer geschrieben und
 * werden durchgereicht; RLS-Verstoesse werden zu 403.
 */
export function pgFehlerAlsAntwort(fehler: unknown): AnfrageFehler | null {
  const pg = fehler as PgFehler
  if (typeof pg?.code !== 'string' || !/^[0-9A-Z]{5}$/.test(pg.code)) return null
  if (pg.code === '42501') return new AnfrageFehler(403, 'Keine Berechtigung für diese Aktion.', pg.code)
  if (pg.code === '23505') return new AnfrageFehler(409, 'Dieser Eintrag existiert bereits.', pg.code)
  if (pg.code === 'P0001') return new AnfrageFehler(400, pg.message, pg.code)
  if (pg.code.startsWith('22') || pg.code.startsWith('23')) {
    return new AnfrageFehler(400, `Ungültige Eingabe: ${pg.message}`, pg.code)
  }
  return null
}

export function datenRouten(app: FastifyInstance, db: Datenbank, konf: Konfiguration, schema: Map<string, Tabelle>) {
  const angemeldet = erfordertAnmeldung(db, konf)

  app.post<{ Params: { tabelle: string }; Body: Abfrage }>(
    '/api/daten/:tabelle',
    { preHandler: angemeldet },
    async (req) => {
      const nutzer = nutzerVon(req)
      const tabelle = schema.get(req.params.tabelle)
      if (!tabelle) throw new AnfrageFehler(404, `Unbekannte Tabelle "${req.params.tabelle}".`, 'tabelle_unbekannt')
      const abfrage = req.body
      if (!abfrage || typeof abfrage !== 'object') throw new AnfrageFehler(400, 'Abfrage fehlt.')
      const { haupt, zaehlung } = baueSql(tabelle, abfrage)
      try {
        return await db.alsNutzer(nutzer, async (v) => {
          const data = haupt ? (await v.query(haupt.text, haupt.werte)).rows : null
          const count = zaehlung ? (await v.query<{ anzahl: number }>(zaehlung.text, zaehlung.werte)).rows[0].anzahl : null
          const zurueck = abfrage.aktion === 'select' ? !abfrage.nurZaehlen : !!abfrage.rueckgabe
          return { data: zurueck ? (data ?? []) : null, count }
        })
      } catch (fehler) {
        throw pgFehlerAlsAntwort(fehler) ?? fehler
      }
    },
  )

  app.post<{ Params: { name: string } }>('/api/rpc/:name', { preHandler: angemeldet }, async (req) => {
    const nutzer = nutzerVon(req)
    if (!RPC_FREIGABE.has(req.params.name)) throw new AnfrageFehler(404, `Unbekannte Funktion "${req.params.name}".`)
    try {
      // Name stammt aus der festen Freigabeliste oben.
      const data = await db.alsNutzer(nutzer, async (v) => (await v.query(`select * from public.${req.params.name}()`)).rows)
      return { data }
    } catch (fehler) {
      throw pgFehlerAlsAntwort(fehler) ?? fehler
    }
  })
}
