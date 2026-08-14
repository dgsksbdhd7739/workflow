import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Plan } from '../types/database'

export function Plaene() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [plaene, setPlaene] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    if (!baustelleId) return
    setLoading(true)
    const { data } = await supabase
      .from('plaene')
      .select('*')
      .eq('baustelle_id', baustelleId)
      .order('erstellt_am', { ascending: false })
    setPlaene(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baustelleId])

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user || !baustelleId) return
    setUploading(true)

    const path = `${baustelleId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('plaene').upload(path, file)
    if (!uploadError) {
      const datei_url = supabase.storage.from('plaene').getPublicUrl(path).data.publicUrl
      await supabase.from('plaene').insert({
        baustelle_id: baustelleId,
        name: file.name,
        datei_url,
        erstellt_von: user.id,
      })
      load()
    }
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Pläne</h1>
        <label className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
          {uploading ? 'Lädt hoch…' : '+ Plan hochladen'}
          <input type="file" accept="image/*,.pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Lädt…</p>
      ) : plaene.length === 0 ? (
        <p className="text-sm text-gray-500">
          Noch keine Pläne hochgeladen. Unterstützt werden Bilder und PDFs — auf beiden können Markierungen gesetzt
          werden.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {plaene.map((p) => (
            <li key={p.id}>
              <Link
                to={`/baustellen/${baustelleId}/plaene/${p.id}`}
                className="block overflow-hidden rounded-xl border border-gray-200 bg-white hover:border-blue-300"
              >
                <div className="aspect-square bg-gray-100">
                  {p.datei_url.match(/\.(png|jpe?g|webp|gif)$/i) ? (
                    <img src={p.datei_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">📄</div>
                  )}
                </div>
                <div className="truncate px-2 py-2 text-xs text-gray-700">{p.name}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
