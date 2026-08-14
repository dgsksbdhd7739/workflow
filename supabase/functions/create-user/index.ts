import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const erlaubteRollen = ['admin', 'planer', 'techniker', 'kunde']

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

    // Client im Kontext des anfragenden Nutzers: identifiziert, wer ruft auf.
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
      return json({ error: 'Nur Admins dürfen Nutzer anlegen.' }, 403)
    }

    const body = await req.json()
    const email = String(body.email ?? '').trim()
    const password = String(body.password ?? '')
    const fullName = String(body.full_name ?? '').trim()
    const role = String(body.role ?? 'techniker')

    if (!email || !password) {
      return json({ error: 'E-Mail und Passwort sind erforderlich.' }, 400)
    }
    if (password.length < 6) {
      return json({ error: 'Passwort muss mindestens 6 Zeichen haben.' }, 400)
    }
    if (!erlaubteRollen.includes(role)) {
      return json({ error: 'Ungültige Rolle.' }, 400)
    }

    // Service-Role-Client: nur serverseitig, nie im Browser sichtbar.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    })
    if (createError || !created.user) {
      return json({ error: createError?.message ?? 'Nutzer konnte nicht angelegt werden.' }, 400)
    }

    if (role !== 'techniker') {
      const { error: roleError } = await adminClient.from('profiles').update({ role }).eq('id', created.user.id)
      if (roleError) {
        return json({ error: `Nutzer angelegt, Rolle konnte aber nicht gesetzt werden: ${roleError.message}` }, 500)
      }
    }

    return json({ id: created.user.id }, 200)
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
