import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { SignedImage } from '../components/SignedImage'
import { ProjektLoeschenDialog } from '../components/ProjektLoeschenDialog'
import { formatProjektAdresse, kartenUrl } from '../lib/adresse'
import type { Baustelle } from '../types/database'

export function Archiv() {
  const { role } = useAuth()
  const kannZugreifen = role === 'admin' || role === 'planer'
  const [baustellen, setBaustellen] = useState<Baustelle[]>([])
  const [loading, setLoading] = useState(true)
  const [loeschenId, setLoeschenId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('baustellen').select('*').eq('archiviert', true).order('name')
    setBaustellen(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (kannZugreifen) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kannZugreifen])

  const reaktivieren = async (id: string) => {
    setBaustellen((prev) => prev.filter((b) => b.id !== id))
    const { error } = await supabase.from('baustellen').update({ archiviert: false }).eq('id', id)
    if (error) load()
  }

  if (!kannZugreifen) {
    return (
      <div className="page">
        <p className="text-sm text-text-muted">Kein Zugriff — das Archiv ist Admin und Planer vorbehalten.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <h1 className="mb-1 text-xl font-semibold text-text">Archiv</h1>
      <p className="mb-4 text-xs text-text-muted">Archivierte Projekte. Reaktivieren bringt sie zurück ins Dashboard.</p>

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : baustellen.length === 0 ? (
        <p className="text-sm text-text-muted">Keine archivierten Projekte.</p>
      ) : (
        <ul className="space-y-2">
          {baustellen.map((b) => (
            <li key={b.id}>
              {loeschenId === b.id ? (
                <ProjektLoeschenDialog
                  baustelle={b}
                  onCancel={() => setLoeschenId(null)}
                  onDeleted={() => {
                    setLoeschenId(null)
                    setBaustellen((prev) => prev.filter((x) => x.id !== b.id))
                  }}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to={`/baustellen/${b.id}`}
                    className="card flex flex-1 items-center gap-3 p-4 opacity-75 transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
                  >
                    {b.logo_pfad && (
                      <SignedImage
                        bucket="projekt-logos"
                        path={b.logo_pfad}
                        alt=""
                        className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-text">{b.name}</div>
                      {formatProjektAdresse(b) && (
                        <span
                          role="link"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            window.open(kartenUrl(formatProjektAdresse(b)!), '_blank', 'noreferrer')
                          }}
                          className="block truncate text-sm text-text-muted hover:text-brand hover:underline"
                        >
                          📍 {formatProjektAdresse(b)}
                        </span>
                      )}
                    </div>
                  </Link>
                  <button onClick={() => reaktivieren(b.id)} className="btn-secondary flex-shrink-0">
                    Reaktivieren
                  </button>
                  <button
                    onClick={() => setLoeschenId(b.id)}
                    className="btn-secondary flex-shrink-0 text-red-600 dark:text-red-400"
                  >
                    Löschen
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
