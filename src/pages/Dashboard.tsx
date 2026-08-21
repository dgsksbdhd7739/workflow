import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ProjektForm } from '../components/ProjektForm'
import { SignedImage } from '../components/SignedImage'
import { formatProjektAdresse, kartenUrl } from '../lib/adresse'
import { formatDatum } from '../lib/datum'
import type { Projekt, Tagesbericht } from '../types/database'

interface TagesberichtMitProjekt extends Tagesbericht {
  projekt_name: string
}

export function Dashboard() {
  const { user, role } = useAuth()
  const kannAnlegen = role === 'admin' || role === 'planer'
  const kannUebersichtSehen = role === 'admin' || role === 'planer'
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [favoritenIds, setFavoritenIds] = useState<Set<string>>(new Set())
  const [neuesteTagesberichte, setNeuesteTagesberichte] = useState<TagesberichtMitProjekt[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const [{ data: projekteData }, { data: favoritenData }] = await Promise.all([
      supabase.from('projekte').select('*').eq('archiviert', false).order('created_at', { ascending: false }),
      supabase.from('favoriten').select('projekt_id').eq('user_id', user.id),
    ])
    setProjekte(projekteData ?? [])
    setFavoritenIds(new Set((favoritenData ?? []).map((f) => f.projekt_id)))

    if (kannUebersichtSehen) {
      const ids = (projekteData ?? []).map((b) => b.id)
      if (ids.length > 0) {
        const { data: tagesberichteData } = await supabase
          .from('tagesberichte')
          .select('*')
          .in('projekt_id', ids)
          .order('datum', { ascending: false })
          .order('erstellt_am', { ascending: false })
          .limit(8)
        const namenMap = Object.fromEntries((projekteData ?? []).map((b) => [b.id, b.name]))
        setNeuesteTagesberichte(
          (tagesberichteData ?? []).map((t) => ({ ...t, projekt_name: namenMap[t.projekt_id] ?? '—' })),
        )
      } else {
        setNeuesteTagesberichte([])
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const toggleFavorit = async (projektId: string) => {
    if (!user) return
    const istFavorit = favoritenIds.has(projektId)
    setFavoritenIds((prev) => {
      const next = new Set(prev)
      if (istFavorit) next.delete(projektId)
      else next.add(projektId)
      return next
    })
    if (istFavorit) {
      await supabase.from('favoriten').delete().eq('user_id', user.id).eq('projekt_id', projektId)
    } else {
      await supabase.from('favoriten').insert({ user_id: user.id, projekt_id: projektId })
    }
  }

  const sortiert = [...projekte].sort((a, b) => {
    const aFav = favoritenIds.has(a.id) ? 1 : 0
    const bFav = favoritenIds.has(b.id) ? 1 : 0
    return bFav - aFav
  })

  return (
    <div className="page">
      {kannUebersichtSehen && !loading && neuesteTagesberichte.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text">
            <ClipboardList className="h-4 w-4 text-brand" strokeWidth={2.25} />
            Neueste Tagesberichte
          </h2>
          <ul className="space-y-1.5">
            {neuesteTagesberichte.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/projekte/${t.projekt_id}/tagesberichte`}
                  className="card flex items-center justify-between gap-3 p-3 text-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text">{t.projekt_name}</div>
                    {t.besonderheiten && (
                      <div className="truncate text-xs text-amber-700 dark:text-amber-400">⚠ {t.besonderheiten}</div>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-xs text-text-subtle">{formatDatum(t.datum)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                to={`/projekte/${b.id}`}
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
