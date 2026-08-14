import { useEffect, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { SignedImage } from '../components/SignedImage'
import type { Plan } from '../types/database'

export function Plaene() {
  const { id: baustelleId } = useParams<{ id: string }>()
  const { user, role } = useAuth()
  const kannBearbeiten = role !== 'kunde'
  const [plaene, setPlaene] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

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
    setFehler(null)

    const path = `${baustelleId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('plaene').upload(path, file)
    if (uploadError) {
      setFehler(uploadError.message)
      setUploading(false)
      e.target.value = ''
      return
    }
    const { error } = await supabase.from('plaene').insert({
      baustelle_id: baustelleId,
      name: file.name,
      datei_pfad: path,
      erstellt_von: user.id,
    })
    if (error) setFehler(error.message)
    else load()
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div className="page">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Pläne</h1>
        {kannBearbeiten && (
          <label className="btn-primary cursor-pointer">
            {uploading ? 'Lädt hoch…' : '+ Plan hochladen'}
            <input type="file" accept="image/*,.pdf" onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
        )}
      </div>

      {fehler && <p className="banner-error mb-4">Fehler: {fehler}</p>}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : plaene.length === 0 ? (
        <p className="text-sm text-text-muted">
          Noch keine Pläne hochgeladen. Unterstützt werden Bilder und PDFs — auf beiden können Markierungen gesetzt
          werden.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {plaene.map((p) => (
            <li key={p.id}>
              <Link
                to={`/baustellen/${baustelleId}/plaene/${p.id}`}
                className="card block overflow-hidden transition-colors hover:border-brand/40"
              >
                <div className="aspect-square bg-surface-hover">
                  {p.datei_pfad.match(/\.(png|jpe?g|webp|gif)$/i) ? (
                    <SignedImage bucket="plaene" path={p.datei_pfad} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">📄</div>
                  )}
                </div>
                <div className="truncate px-2 py-2 text-xs text-text-muted">{p.name}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
