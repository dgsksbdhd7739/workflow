import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ProjektForm } from '../components/ProjektForm'
import { SignedImage } from '../components/SignedImage'
import { formatProjektAdresse, kartenUrl } from '../lib/adresse'
import type { Baustelle } from '../types/database'

export function Dashboard() {
  const { user, role } = useAuth()
  const kannAnlegen = role === 'admin' || role === 'planer'
  const [baustellen, setBaustellen] = useState<Baustelle[]>([])
  const [favoritenIds, setFavoritenIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const [{ data: baustellenData }, { data: favoritenData }] = await Promise.all([
      supabase.from('baustellen').select('*').eq('archiviert', false).order('created_at', { ascending: false }),
      supabase.from('favoriten').select('baustelle_id').eq('user_id', user.id),
    ])
    setBaustellen(baustellenData ?? [])
    setFavoritenIds(new Set((favoritenData ?? []).map((f) => f.baustelle_id)))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const toggleFavorit = async (baustelleId: string) => {
    if (!user) return
    const istFavorit = favoritenIds.has(baustelleId)
    setFavoritenIds((prev) => {
      const next = new Set(prev)
      if (istFavorit) next.delete(baustelleId)
      else next.add(baustelleId)
      return next
    })
    if (istFavorit) {
      await supabase.from('favoriten').delete().eq('user_id', user.id).eq('baustelle_id', baustelleId)
    } else {
      await supabase.from('favoriten').insert({ user_id: user.id, baustelle_id: baustelleId })
    }
  }

  const sortiert = [...baustellen].sort((a, b) => {
    const aFav = favoritenIds.has(a.id) ? 1 : 0
    const bFav = favoritenIds.has(b.id) ? 1 : 0
    return bFav - aFav
  })

  return (
    <div className="page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Projekte</h1>
        {kannAnlegen && (
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            {showForm ? 'Abbrechen' : '+ Neues Projekt'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-6">
          <ProjektForm
            onSaved={() => {
              setShowForm(false)
              load()
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Lädt…</p>
      ) : sortiert.length === 0 ? (
        <p className="text-sm text-text-muted">Noch keine Projekte angelegt.</p>
      ) : (
        <ul className="space-y-2">
          {sortiert.map((b) => (
            <li key={b.id} className="flex items-center gap-2">
              <button
                onClick={() => toggleFavorit(b.id)}
                aria-label={favoritenIds.has(b.id) ? 'Favorit entfernen' : 'Als Favorit markieren'}
                className="flex-shrink-0 text-xl leading-none text-amber-500"
              >
                {favoritenIds.has(b.id) ? '★' : '☆'}
              </button>
              <Link
                to={`/baustellen/${b.id}`}
                className="card flex flex-1 items-center gap-3 p-4 transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
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
                  <div className="truncate font-medium text-text">{b.name}</div>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
