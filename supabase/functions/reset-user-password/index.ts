import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Nicht angemeldet.' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser()
    if (!caller) {
      return json({ error: 'Nicht angemeldet.' }, 401)
    }

    const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', caller.id).single()
    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Nur Admins dürfen Passwörter zurücksetzen.' }, 403)
    }

    const body = await req.json()
    const userId = String(body.user_id ?? '')
    const password = String(body.password ?? '')
    if (!userId || !password) {
      return json({ error: 'user_id und password sind erforderlich.' }, 400)
    }
    if (password.length < 6) {
      return json({ error: 'Passwort muss mindestens 6 Zeichen haben.' }, 400)
    }

    // Service-Role-Client: nur serverseitig, nie im Browser sichtbar.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password })
    if (updateError) {
      return json({ error: updateError.message || 'Passwort konnte nicht zurückgesetzt werden.' }, 400)
    }

    // Nutzer muss das vom Admin vergebene Passwort beim naechsten Login
    // aendern -- gleiche Logik wie bei der Ersteinrichtung (Migration 0011).
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ muss_passwort_aendern: true })
      .eq('id', userId)
    if (profileError) {
      return json({ error: `Passwort gesetzt, Kennzeichnung fehlgeschlagen: ${profileError.message}` }, 500)
    }

    return json({ ok: true }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
