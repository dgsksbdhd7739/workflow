import { readFile } from 'node:fs/promises'
import { SignJWT, importPKCS8 } from 'jose'
import type { FastifyBaseLogger } from 'fastify'
import type { Datenbank } from '../datenbank.ts'

// Push fuer neue Team-Chat-Nachrichten ueber Firebase Cloud Messaging (HTTP
// v1). Nachfolger der Edge Function send-chat-push; ausgeloest per
// pg_notify('chat_push') aus dem Trigger notify_chat_nachricht().

interface Dienstkonto {
  project_id: string
  client_email: string
  private_key: string
  token_uri?: string
}

export class ChatPush {
  private konto: Dienstkonto | null = null
  private zugriff: { token: string; gueltigBis: number } | null = null
  private readonly db: Datenbank
  private readonly log: FastifyBaseLogger

  constructor(db: Datenbank, log: FastifyBaseLogger) {
    this.db = db
    this.log = log
  }

  async laden(datei: string | null) {
    if (!datei) {
      this.log.warn('FIREBASE_DIENSTKONTO_DATEI nicht gesetzt -- Chat-Push ist deaktiviert.')
      return
    }
    this.konto = JSON.parse(await readFile(datei, 'utf8')) as Dienstkonto
  }

  private async zugriffstoken(konto: Dienstkonto) {
    if (this.zugriff && this.zugriff.gueltigBis > Date.now() + 60_000) return this.zugriff.token
    const tokenUri = konto.token_uri ?? 'https://oauth2.googleapis.com/token'
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(konto.client_email)
      .setAudience(tokenUri)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importPKCS8(konto.private_key, 'RS256'))
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    })
    if (!res.ok) throw new Error(`Google-Token fehlgeschlagen: ${res.status} ${await res.text()}`)
    const daten = (await res.json()) as { access_token: string; expires_in: number }
    this.zugriff = { token: daten.access_token, gueltigBis: Date.now() + daten.expires_in * 1000 }
    return daten.access_token
  }

  async nachrichtVersenden(nachrichtId: string) {
    const konto = this.konto
    if (!konto) return
    const ziel = await this.db.alsDienst(async (v) => {
      const { rows } = await v.query<{ text: string | null; user_id: string; unternehmen_id: string; absender: string | null }>(
        `select n.text, n.user_id, n.unternehmen_id, p.full_name as absender
           from public.chat_nachrichten n left join public.profiles p on p.id = n.user_id
          where n.id = $1`,
        [nachrichtId],
      )
      const n = rows[0]
      if (!n) return null
      // Empfaenger: aktive Firmenmitglieder ausser Absender und Kunden.
      const { rows: tokens } = await v.query<{ token: string }>(
        `select t.token from public.push_tokens t join public.profiles p on p.id = t.user_id
          where p.unternehmen_id = $1 and p.id <> $2 and p.role <> 'kunde' and not p.deaktiviert`,
        [n.unternehmen_id, n.user_id],
      )
      return { n, tokens: tokens.map((t) => t.token) }
    })
    if (!ziel || ziel.tokens.length === 0) return

    const zugriff = await this.zugriffstoken(konto)
    const titel = ziel.n.absender ? `${ziel.n.absender} im Team-Chat` : 'Neue Nachricht im Team-Chat'
    const text = (ziel.n.text ?? '').slice(0, 120)
    const ungueltig: string[] = []
    for (const token of ziel.tokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${konto.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${zugriff}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: titel, body: text },
            android: { priority: 'high', notification: { channel_id: 'team_chat', tag: 'team_chat' } },
            data: { typ: 'team_chat', nachricht_id: String(nachrichtId) },
          },
        }),
      })
      // Ungueltige/abgelaufene Geraete-Tokens gleich aufraeumen.
      if (res.status === 404 || res.status === 400) ungueltig.push(token)
      else if (!res.ok) this.log.warn({ status: res.status }, 'FCM-Versand fehlgeschlagen')
    }
    if (ungueltig.length) {
      await this.db.alsDienst((v) => v.query('delete from public.push_tokens where token = any($1)', [ungueltig]))
    }
  }
}
