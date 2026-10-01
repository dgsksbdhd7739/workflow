// Legt eine neue Firma (unternehmen) samt ihrem ersten Admin-Account an.
// Es gibt bewusst keine Selbstregistrierung und keine In-App-Rolle, die
// firmenuebergreifend agieren darf -- ein bestehender Firmen-Admin soll
// niemals selbst eine neue Firma anlegen koennen. Zwei Wege sind autorisiert:
//  1. Shared Secret (PROVISION_SECRET) -- fuer scripts/create-unternehmen.mjs,
//     kein eingeloggter Nutzer noetig.
//  2. Eingeloggter Nutzer, der laut ist_plattform_admin() (0053) ein
//     Plattform-Admin ist -- fuer die /plattform-admin-Seite in der App.
//
// Deployment: mit --no-verify-jwt (das Gateway soll den Request auch ohne
// JWT durchlassen, Weg 1 hat keinen; die Funktion prueft Autorisierung
// selbst, wie create-user es fuer "nur Admins" bereits vormacht).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-provision-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const secret = req.headers.get('x-provision-secret')
    const erwartetesSecret = Deno.env.get('PROVISION_SECRET')
    const authHeader = req.headers.get('Authorization')

    let autorisiert = false
    if (erwartetesSecret && secret === erwartetesSecret) {
      autorisiert = true
    } else if (authHeader) {
      const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
      const {
        data: { user: caller },
      } = await callerClient.auth.getUser()
      if (caller) {
        const { data: istAdmin } = await callerClient.rpc('ist_plattform_admin')
        autorisiert = istAdmin === true
      }
    }
    if (!autorisiert) {
      return json({ error: 'Nicht autorisiert.' }, 401)
    }

    const body = await req.json()
    const firmenname = String(body.firmenname ?? '').trim()
    const adminEmail = String(body.admin_email ?? '').trim()
    const adminName = String(body.admin_name ?? '').trim()
    const maxNutzer = body.max_nutzer != null && body.max_nutzer !== '' ? Number(body.max_nutzer) : null
    // Ohne mitgegebenes Passwort generiert die Funktion selbst eins (Weg 2,
    // die Plattform-Admin-UI fragt den Nutzer nicht nach einem Passwort) --
    // das Skript (Weg 1) generiert es weiterhin selbst und schickt es mit.
    let adminPassword = String(body.admin_password ?? '')
    if (!adminPassword) {
      adminPassword = crypto.randomUUID().replace(/-/g, '').slice(0, 14)
    }

    if (!firmenname) return json({ error: 'firmenname fehlt.' }, 400)
    if (!adminEmail) return json({ error: 'admin_email fehlt.' }, 400)
    if (adminPassword.length < 6) return json({ error: 'admin_password muss mindestens 6 Zeichen haben.' }, 400)
    if (maxNutzer != null && (!Number.isInteger(maxNutzer) || maxNutzer < 1)) {
      return json({ error: 'max_nutzer muss eine positive ganze Zahl sein.' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: unternehmen, error: unternehmenError } = await admin
      .from('unternehmen')
      .insert({ name: firmenname, max_nutzer: maxNutzer })
      .select('id')
      .single()
    if (unternehmenError || !unternehmen) {
      return json({ error: `Firma konnte nicht angelegt werden: ${unternehmenError?.message}` }, 500)
    }

    // handle_new_user() (Migration 0033) liest unternehmen_id aus den
    // user_metadata und legt das Profil automatisch mit dieser Zuordnung an.
    const { data: created, error: createUserError } = await admin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        ...(adminName ? { full_name: adminName } : {}),
        unternehmen_id: unternehmen.id,
      },
    })
    if (createUserError || !created.user) {
      // Firma ohne nutzbaren Admin waere ein verwaister Datensatz.
      await admin.from('unternehmen').delete().eq('id', unternehmen.id)
      return json({ error: `Admin-Account konnte nicht angelegt werden: ${createUserError?.message}` }, 500)
    }

    const { error: roleError } = await admin.from('profiles').update({ role: 'admin' }).eq('id', created.user.id)
    if (roleError) {
      return json(
        { error: `Firma und Nutzer wurden angelegt, Rolle konnte aber nicht auf admin gesetzt werden: ${roleError.message}` },
        500,
      )
    }

    return json({ unternehmen_id: unternehmen.id, admin_user_id: created.user.id, admin_password: adminPassword }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
