import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
)

type StorageBucket = 'mangel-fotos' | 'plaene' | 'projekt-logos' | 'dokumente' | 'unternehmen-logos'

/**
 * Laedt eine vom Nutzer ausgewaehlte Datei hoch. Im Android-WebView (Capacitor)
 * fuehrt das direkte Uebergeben eines File-Objekts aus dem Datei-Picker (das
 * seinen Inhalt lazy ueber eine content://-URI streamt) bei fetch() teils zu
 * "Failed to fetch", ohne dass ueberhaupt eine Anfrage rausgeht. Das vorherige
 * Einlesen in einen ArrayBuffer zwingt den Browser, die Datei vollstaendig ins
 * Memory zu laden, was auf allen Plattformen zuverlaessig funktioniert.
 */
export async function uploadFile(bucket: StorageBucket, path: string, file: File) {
  const bytes = await file.arrayBuffer()
  return supabase.storage.from(bucket).upload(path, bytes, { contentType: file.type || 'application/octet-stream' })
}

/**
 * Alle Storage-Buckets sind privat (siehe Migration 0007, 0012). Anzeige/
 * Download funktioniert nur ueber zeitlich begrenzte signierte URLs.
 */
export async function getSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 3600,
) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
  if (error) {
    console.error(`Signed-URL-Fehler (${bucket}/${path}):`, error.message)
  }
  return { url: data?.signedUrl ?? null, error: error?.message ?? null }
}
