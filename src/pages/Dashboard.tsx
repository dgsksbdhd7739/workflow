import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, HelpCircle, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ProjektForm } from '../components/ProjektForm'
import { ProjektStatusKarte, type ProjektKartenStats } from '../components/ProjektStatusKarte'
import { formatDatum } from '../lib/datum'
import type { AufgabeTicket, Projekt } from '../types/database'

const heute = () => new Date().toISOString().slice(0, 10)

const leereStats: ProjektKartenStats = { offen: 0, inBearbeitung: 0, erledigt: 0, ticketsOffen: 0, ticketsUeberfaellig: 0 }

interface TicketMitKontext extends AufgabeTicket {
  aufgabe_titel: string
  projekt_id: string
  projekt_name: string
}

export function Dashboard() {
  const { user, role, istPlattformAdmin } = useAuth()
  const kannAnlegen = role === 'admin' || role === 'planer'
  const kannUebersichtSehen = role === 'admin' || role === 'planer'
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [favoritenIds, setFavoritenIds] = useState<Set<string>>(new Set())
  const [projektStats, setProjektStats] = useState<Record<string, ProjektKartenStats>>({})
  const [heutigeBerichte, setHeutigeBerichte] = useState<Set<string>>(new Set())
  const [offeneTickets, setOffeneTickets] = useState<TicketMitKontext[]>([])
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

    const ids = (projekteData ?? []).map((b) => b.id)
    if (ids.length > 0) {
      const { data: heutigeBerichteData } = await supabase
        .from('tagesberichte')
        .select('projekt_id')
        .eq('datum', heute())
        .in('projekt_id', ids)
      setHeutigeBerichte(new Set((heutigeBerichteData ?? []).map((b) => b.projekt_id)))

      const { data: aufgabenFuerStats } = await supabase.from('aufgaben').select('id, projekt_id, status').in('projekt_id', ids)
      const aufgabeProjektMap = Object.fromEntries((aufgabenFuerStats ?? []).map((a) => [a.id, a.projekt_id]))
      const aufgabeIdsFuerStats = (aufgabenFuerStats ?? []).map((a) => a.id)

      const statsMap: Record<string, ProjektKartenStats> = {}
      for (const id of ids) statsMap[id] = { ...leereStats }
      for (const a of aufgabenFuerStats ?? []) {
        const s = statsMap[a.projekt_id]
        if (!s) continue
        if (a.status === 'offen') s.offen++
        else if (a.status === 'in_bearbeitung') s.inBearbeitung++
        else if (a.status === 'erledigt') s.erledigt++
      }

      if (aufgabeIdsFuerStats.length > 0) {
        const { data: ticketsFuerStats } = await supabase
          .from('aufgabe_tickets')
          .select('aufgabe_id, status, erledigen_bis, nachfrist')
          .eq('status', 'offen')
          .in('aufgabe_id', aufgabeIdsFuerStats)
        const heuteDatum = heute()
        for (const t of ticketsFuerStats ?? []) {
          const projektId = aufgabeProjektMap[t.aufgabe_id]
          const s = statsMap[projektId]
          if (!s) continue
          s.ticketsOffen++
          const faelligkeit = t.nachfrist ?? t.erledigen_bis
          if (faelligkeit && faelligkeit < heuteDatum) s.ticketsUeberfaellig++
        }
      }
      setProjektStats(statsMap)
    } else {
      setProjektStats({})
      setHeutigeBerichte(new Set())
    }

    if (kannUebersichtSehen) {
      if (ids.length > 0) {
        const namenMap = Object.fromEntries((projekteData ?? []).map((b) => [b.id, b.name]))
        const { data: aufgabenData } = await supabase.from('aufgaben').select('id, titel, projekt_id').in('projekt_id', ids)
        const aufgabenMap = Object.fromEntries((aufgabenData ?? []).map((a) => [a.id, a]))
        const aufgabeIds = (aufgabenData ?? []).map((a) => a.id)
        if (aufgabeIds.length > 0) {
          const { data: ticketsData } = await supabase
            .from('aufgabe_tickets')
            .select('*')
            .in('aufgabe_id', aufgabeIds)
            .eq('status', 'offen')
            .order('erstellt_am', { ascending: false })
            .limit(8)
          setOffeneTickets(
            (ticketsData ?? []).map((t) => {
              const aufgabe = aufgabenMap[t.aufgabe_id]
              return {
                ...t,
                aufgabe_titel: aufgabe?.titel ?? '—',
                projekt_id: aufgabe?.projekt_id ?? '',
                projekt_name: namenMap[aufgabe?.projekt_id] ?? '—',
              }
            }),
          )
        } else {
          setOffeneTickets([])
        }
      } else {
        setOffeneTickets([])
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
      {/* Nur Mobil/App: Punkte, die nicht in die feste untere Leiste (max. 5) passen */}
      <div className="mb-6 grid grid-cols-2 gap-2 md:hidden">
        <Link to="/hilfe" className="card flex items-center gap-2 p-3 text-sm font-medium text-text hover:border-brand/40">
          <HelpCircle className="h-4 w-4 text-brand" strokeWidth={2.25} />
          Hilfe
        </Link>
        {istPlattformAdmin && (
          <Link
            to="/plattform-admin"
            className="card flex items-center gap-2 p-3 text-sm font-medium text-text hover:border-brand/40"
          >
            <Building2 className="h-4 w-4 flex-shrink-0 text-brand" strokeWidth={2.25} />
            <span className="truncate">Plattform-Verwaltung</span>
          </Link>
        )}
      </div>

      {kannUebersichtSehen && !loading && offeneTickets.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" strokeWidth={2.25} />
            Offene Tickets
          </h2>
          <ul className="space-y-1.5">
            {offeneTickets.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/projekte/${t.projekt_id}/aufgaben`}
                  className="card flex items-center justify-between gap-3 border-red-300 p-3 text-sm transition-colors hover:border-brand/40 hover:bg-brand-soft/40 dark:border-red-900"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-text">
                      {t.projekt_name} · {t.aufgabe_titel}
                    </div>
                    <div className="truncate text-xs text-text-muted">{t.text}</div>
                  </div>
                  <span className="flex-shrink-0 text-xs text-text-subtle">{formatDatum(t.erstellt_am)}</span>
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
        <ul className="space-y-3">
          {sortiert.map((b) => (
            <ProjektStatusKarte
              key={b.id}
              projekt={b}
              stats={projektStats[b.id] ?? leereStats}
              heutigerBerichtErstellt={heutigeBerichte.has(b.id)}
              istFavorit={favoritenIds.has(b.id)}
              onToggleFavorit={() => toggleFavorit(b.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
