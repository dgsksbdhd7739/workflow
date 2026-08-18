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
      return json({ error: 'Nur Admins dürfen Nutzer löschen.' }, 403)
    }

    const body = await req.json()
    const userId = String(body.user_id ?? '')
    if (!userId) {
      return json({ error: 'user_id ist erforderlich.' }, 400)
    }
    if (userId === caller.id) {
      return json({ error: 'Du kannst dich nicht selbst löschen.' }, 400)
    }

    // Service-Role-Client: nur serverseitig, nie im Browser sichtbar.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) {
      const msg = deleteError.message ?? ''
      if (/foreign key|violat/i.test(msg)) {
        return json(
          {
            error:
              'Nutzer kann nicht gelöscht werden, da noch Datensätze (Pläne, Aufgaben, Zeiterfassung o. Ä.) mit ihm verknüpft sind. Bitte stattdessen deaktivieren.',
          },
          409,
        )
      }
      return json({ error: msg || 'Nutzer konnte nicht gelöscht werden.' }, 400)
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
