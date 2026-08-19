// Legt eine neue Firma (unternehmen) samt ihrem ersten Admin-Account an.
// Es gibt bewusst keine Selbstregistrierung und keine In-App-Rolle, die
// firmenuebergreifend agieren darf -- ein bestehender Firmen-Admin soll
// niemals selbst eine neue Firma anlegen koennen. Absicherung deshalb wie
// bei publish-app-update ueber ein eigenes Shared Secret statt eines
// eingeloggten Nutzers.
//
// Deployment: mit --no-verify-jwt (kein eingeloggter Nutzer noetig).
// Benoetigtes Secret: PROVISION_SECRET (supabase secrets set)
// Aufruf: node scripts/create-unternehmen.mjs "Firma GmbH" admin@firma.de "Vorname Nachname"

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-provision-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const secret = req.headers.get('x-provision-secret')
    const erwartet = Deno.env.get('PROVISION_SECRET')
    if (!erwartet || !secret || secret !== erwartet) {
      return json({ error: 'Nicht autorisiert.' }, 401)
    }

    const body = await req.json()
    const firmenname = String(body.firmenname ?? '').trim()
    const adminEmail = String(body.admin_email ?? '').trim()
    const adminPassword = String(body.admin_password ?? '')
    const adminName = String(body.admin_name ?? '').trim()

    if (!firmenname) return json({ error: 'firmenname fehlt.' }, 400)
    if (!adminEmail) return json({ error: 'admin_email fehlt.' }, 400)
    if (adminPassword.length < 6) return json({ error: 'admin_password muss mindestens 6 Zeichen haben.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: unternehmen, error: unternehmenError } = await admin
      .from('unternehmen')
      .insert({ name: firmenname })
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

    return json({ unternehmen_id: unternehmen.id, admin_user_id: created.user.id }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
