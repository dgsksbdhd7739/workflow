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
      return json({ error: 'Nur Admins dürfen Nutzer deaktivieren.' }, 403)
    }

    const body = await req.json()
    const userId = String(body.user_id ?? '')
    const aktiv = Boolean(body.aktiv)
    if (!userId) {
      return json({ error: 'user_id ist erforderlich.' }, 400)
    }
    if (userId === caller.id && !aktiv) {
      return json({ error: 'Du kannst dich nicht selbst deaktivieren.' }, 400)
    }

    // Service-Role-Client: nur serverseitig, nie im Browser sichtbar.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // "876000h" (~100 Jahre) sperrt effektiv dauerhaft; "none" hebt die Sperre auf.
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: aktiv ? 'none' : '876000h',
    })
    if (updateError) {
      return json({ error: updateError.message || 'Status konnte nicht geändert werden.' }, 400)
    }

    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ deaktiviert: !aktiv })
      .eq('id', userId)
    if (profileError) {
      return json({ error: `Status gesetzt, Kennzeichnung fehlgeschlagen: ${profileError.message}` }, 500)
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
