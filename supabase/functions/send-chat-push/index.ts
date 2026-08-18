// Wird per DB-Trigger (notify_chat_nachricht, Migration 0023) bei jeder
// neuen Team-Chat-Nachricht aufgerufen. Verschickt eine FCM-Push-
// Benachrichtigung an alle Team-Kollegen (gleiches Unternehmen, nicht
// Kunde-Rolle, nicht der Absender selbst) ueber die FCM HTTP-v1-API.
//
// Deployment: mit --no-verify-jwt, da der Aufruf nicht von einem
// eingeloggten Nutzer kommt, sondern vom DB-Trigger. Absicherung stattdessen
// ueber ein eigenes Shared Secret (x-trigger-secret Header).
//
// Benoetigte Secrets (supabase secrets set):
//   CHAT_PUSH_TRIGGER_SECRET  - identisch zu app.settings.chat_push_secret in der DB
//   FIREBASE_SERVICE_ACCOUNT  - kompletter Inhalt der Firebase-Service-Account-JSON

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-trigger-secret',
}

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

let cachedToken: { token: string; exp: number } | null = null

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token

  const key = await importPKCS8(sa.private_key, 'RS256')
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`OAuth-Fehler: ${JSON.stringify(data)}`)
  cachedToken = { token: data.access_token, exp: now + data.expires_in }
  return data.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const triggerSecret = req.headers.get('x-trigger-secret')
    const erwartetesSecret = Deno.env.get('CHAT_PUSH_TRIGGER_SECRET')
    if (!erwartetesSecret || !triggerSecret || triggerSecret !== erwartetesSecret) {
      return json({ error: 'Nicht autorisiert.' }, 401)
    }

    const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!saJson) return json({ error: 'FIREBASE_SERVICE_ACCOUNT ist nicht gesetzt.' }, 500)
    const sa: ServiceAccount = JSON.parse(saJson)

    const { nachricht_id } = await req.json()
    if (!nachricht_id) return json({ error: 'nachricht_id fehlt.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: nachricht } = await admin
      .from('chat_nachrichten')
      .select('id, text, user_id, unternehmen_id')
      .eq('id', nachricht_id)
      .single()
    if (!nachricht) return json({ error: 'Nachricht nicht gefunden.' }, 404)

    const { data: absender } = await admin.from('profiles').select('full_name').eq('id', nachricht.user_id).single()

    const { data: empfaenger } = await admin
      .from('profiles')
      .select('id')
      .eq('unternehmen_id', nachricht.unternehmen_id)
      .neq('id', nachricht.user_id)
      .neq('role', 'kunde')
      .eq('deaktiviert', false)
    const empfaengerIds = (empfaenger ?? []).map((p) => p.id)
    if (empfaengerIds.length === 0) return json({ ok: true, gesendet: 0 })

    const { data: tokens } = await admin.from('push_tokens').select('token, user_id').in('user_id', empfaengerIds)
    if (!tokens || tokens.length === 0) return json({ ok: true, gesendet: 0 })

    const accessToken = await getAccessToken(sa)
    const titel = absender?.full_name ? `${absender.full_name} im Team-Chat` : 'Neue Nachricht im Team-Chat'
    const body = (nachricht.text ?? '').slice(0, 120)

    let gesendet = 0
    let fehlgeschlagen = 0
    for (const t of tokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title: titel, body },
            android: { priority: 'high', notification: { channel_id: 'team_chat', tag: 'team_chat' } },
            data: { typ: 'team_chat', nachricht_id: String(nachricht.id) },
          },
        }),
      })
      if (res.ok) {
        gesendet++
      } else {
        fehlgeschlagen++
        // Ungueltige/abgelaufene Tokens gleich aufraeumen.
        if (res.status === 404 || res.status === 400) {
          await admin.from('push_tokens').delete().eq('token', t.token)
        }
      }
    }

    return json({ ok: true, gesendet, fehlgeschlagen }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
