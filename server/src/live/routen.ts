import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import type { Claims, Datenbank } from '../datenbank.ts'
import type { Konfiguration } from '../konfiguration.ts'
import { pruefeZugriffstoken } from '../auth/token.ts'
import { sitzungIstAktiv } from '../auth/sitzungen.ts'
import type { Lauscher } from './lauscher.ts'

// Echtzeit fuer die Chats (ersetzt Supabase Realtime). Protokoll (JSON):
//   Client -> {typ:'anmelden', token}                       (auch nach jeder Token-Erneuerung)
//             {typ:'abonnieren', kanal, tabelle, wert}      (wert = unternehmen_id bzw. projekt_id)
//             {typ:'abbestellen', kanal}
//   Server -> {typ:'angemeldet'} | {typ:'abonniert', kanal} | {typ:'fehler', kanal?, meldung}
//             {typ:'ereignis', kanal, ereignis:'INSERT', neu} | {..., ereignis:'DELETE', alt:{id}}
// Neue Zeilen werden vor dem Zustellen im RLS-Kontext des Empfaengers
// nachgeladen -- wer sie per API nicht lesen duerfte, bekommt sie auch hier nicht.

const LIVE_TABELLEN: Record<string, { spalte: 'unternehmen_id' | 'projekt_id'; pruefTabelle: string }> = {
  chat_nachrichten: { spalte: 'unternehmen_id', pruefTabelle: 'unternehmen' },
  projekt_chat_nachrichten: { spalte: 'projekt_id', pruefTabelle: 'projekte' },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ABOS = 20

interface LiveEreignis {
  tabelle: string
  ereignis: 'INSERT' | 'DELETE'
  id: string
  unternehmen_id: string | null
  projekt_id: string | null
}

interface Verbindung {
  socket: WebSocket
  claims: Claims | null
  ablauf: number
  sitzungGeprueftAm: number
  abos: Map<string, { tabelle: string; wert: string }>
}

export function liveRouten(app: FastifyInstance, db: Datenbank, konf: Konfiguration, lauscher: Lauscher) {
  const verbindungen = new Set<Verbindung>()

  const senden = (v: Verbindung, nachricht: object) => {
    if (v.socket.readyState === v.socket.OPEN) v.socket.send(JSON.stringify(nachricht))
  }

  // Sitzung hoechstens alle 30 s gegen die DB pruefen (Abmelden/Sperre wirkt so zeitnah).
  async function nochGueltig(v: Verbindung): Promise<boolean> {
    if (!v.claims || v.ablauf < Date.now() / 1000) return false
    if (Date.now() - v.sitzungGeprueftAm < 30_000) return true
    const aktiv = await db.alsDienst((d) => sitzungIstAktiv(d, v.claims!.session_id, v.claims!.sub))
    v.sitzungGeprueftAm = Date.now()
    if (!aktiv) {
      senden(v, { typ: 'fehler', meldung: 'Sitzung beendet.', code: 'sitzung_beendet' })
      v.socket.close(4401, 'Sitzung beendet')
    }
    return aktiv
  }

  lauscher.on('live', async (e: LiveEreignis) => {
    const zuordnung = LIVE_TABELLEN[e.tabelle]
    if (!zuordnung) return
    const wert = e[zuordnung.spalte]
    for (const v of verbindungen) {
      for (const [kanal, abo] of v.abos) {
        if (abo.tabelle !== e.tabelle || abo.wert !== wert) continue
        try {
          if (!(await nochGueltig(v))) break
          if (e.ereignis === 'DELETE') {
            senden(v, { typ: 'ereignis', kanal, ereignis: 'DELETE', alt: { id: e.id } })
          } else {
            const zeile = await db.alsNutzer(v.claims!, async (d) =>
              (await d.query(`select * from public.${e.tabelle} where id = $1`, [e.id])).rows[0],
            )
            if (zeile) senden(v, { typ: 'ereignis', kanal, ereignis: 'INSERT', neu: zeile })
          }
        } catch (fehler) {
          app.log.warn({ err: fehler }, 'Live-Zustellung fehlgeschlagen')
        }
      }
    }
  })

  app.get('/api/live', { websocket: true }, (socket) => {
    const v: Verbindung = { socket, claims: null, ablauf: 0, sitzungGeprueftAm: 0, abos: new Map() }
    verbindungen.add(v)
    socket.on('close', () => verbindungen.delete(v))

    // Ohne Anmeldung binnen 10 s wird die Verbindung geschlossen.
    const frist = setTimeout(() => {
      if (!v.claims) socket.close(4401, 'Nicht angemeldet')
    }, 10_000)
    socket.on('close', () => clearTimeout(frist))

    socket.on('message', async (roh) => {
      let n: { typ?: string; token?: string; kanal?: string; tabelle?: string; wert?: string }
      try {
        n = JSON.parse(String(roh))
      } catch {
        return senden(v, { typ: 'fehler', meldung: 'Ungültige Nachricht.' })
      }
      try {
        if (n.typ === 'anmelden') {
          const claims = await pruefeZugriffstoken(String(n.token ?? ''), konf.jwtGeheimnis)
          const [, inhalt] = String(n.token).split('.')
          v.ablauf = Number(JSON.parse(Buffer.from(inhalt, 'base64url').toString()).exp)
          if (v.claims && v.claims.sub !== claims.sub) v.abos.clear()
          v.claims = claims
          v.sitzungGeprueftAm = 0
          if (!(await nochGueltig(v))) return
          return senden(v, { typ: 'angemeldet' })
        }
        if (!(await nochGueltig(v))) return senden(v, { typ: 'fehler', meldung: 'Nicht angemeldet.', code: 'nicht_angemeldet' })

        if (n.typ === 'abonnieren') {
          const kanal = String(n.kanal ?? '')
          const zuordnung = LIVE_TABELLEN[String(n.tabelle)]
          if (!kanal || !zuordnung || !UUID.test(String(n.wert)) || v.abos.size >= MAX_ABOS) {
            return senden(v, { typ: 'fehler', kanal, meldung: 'Abo nicht möglich.' })
          }
          // Nur abonnieren, was der Nutzer per RLS sehen darf (eigene Firma bzw. Projekt).
          const sichtbar = await db.alsNutzer(v.claims!, async (d) =>
            (await d.query(`select 1 from public.${zuordnung.pruefTabelle} where id = $1`, [n.wert])).rowCount,
          )
          if (!sichtbar) return senden(v, { typ: 'fehler', kanal, meldung: 'Kein Zugriff.' })
          v.abos.set(kanal, { tabelle: String(n.tabelle), wert: String(n.wert) })
          return senden(v, { typ: 'abonniert', kanal })
        }
        if (n.typ === 'abbestellen') {
          v.abos.delete(String(n.kanal ?? ''))
          return
        }
        senden(v, { typ: 'fehler', meldung: 'Unbekannter Nachrichtentyp.' })
      } catch {
        senden(v, { typ: 'fehler', meldung: 'Anmeldung ungültig oder abgelaufen.', code: 'token_ungueltig' })
      }
    })
  })
}
