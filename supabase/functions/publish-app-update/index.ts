// Nimmt das gezippte dist/-Bundle entgegen und laedt es in den oeffentlichen
// Storage-Bucket "app-updates" hoch, inkl. Aktualisierung von latest.json.
// Wird ausschliesslich von scripts/publish-update.mjs (lokal, von Hand)
// aufgerufen, nie von der App selbst.
//
// Deployment: mit --no-verify-jwt (kein eingeloggter Nutzer noetig),
// Absicherung stattdessen ueber ein eigenes Shared Secret.
// Benoetigtes Secret: PUBLISH_UPDATE_SECRET (supabase secrets set)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-publish-secret, x-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const secret = req.headers.get('x-publish-secret')
    const erwartet = Deno.env.get('PUBLISH_UPDATE_SECRET')
    if (!erwartet || !secret || secret !== erwartet) {
      return json({ error: 'Nicht autorisiert.' }, 401)
    }

    const version = req.headers.get('x-version')
    if (!version) return json({ error: 'x-version fehlt.' }, 400)

    const zipBytes = new Uint8Array(await req.arrayBuffer())
    if (zipBytes.length === 0) return json({ error: 'Leerer Request-Body.' }, 400)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const zipPath = `dist-${version}.zip`
    const { error: uploadError } = await admin.storage.from('app-updates').upload(zipPath, zipBytes, {
      contentType: 'application/zip',
      upsert: true,
    })
    if (uploadError) return json({ error: `Upload fehlgeschlagen: ${uploadError.message}` }, 500)

    const manifest = {
      version,
      url: `${supabaseUrl}/storage/v1/object/public/app-updates/${zipPath}`,
    }
    const { error: manifestError } = await admin.storage
      .from('app-updates')
      .upload('latest.json', new TextEncoder().encode(JSON.stringify(manifest)), {
        contentType: 'application/json',
        upsert: true,
      })
    if (manifestError) return json({ error: `Manifest-Upload fehlgeschlagen: ${manifestError.message}` }, 500)

    return json({ ok: true, ...manifest }, 200)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
