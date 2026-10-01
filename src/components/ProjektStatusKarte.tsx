import { Link } from 'react-router-dom'
import { SignedImage } from './SignedImage'
import { formatProjektAdresse, kartenUrl } from '../lib/adresse'
import { formatDatum } from '../lib/datum'
import type { Projekt } from '../types/database'

// Kompaktes Status-Widget je Projekt fuers Dashboard, angelehnt an die
// Projekt-Kachel aus dem PlanRadar-Dashboard (Name/Nummer/Zeitraum, farbige
// Aufgaben-Status-Verteilung, Ticket-Kennzahlen, Fortschritts-Ring) -- hier
// mit WorkFlows eigenen Status-Begriffen (siehe Aufgaben.tsx: Stopp/In
// Arbeit/Abgeschlossen) statt PlanRadars erfundenem 6-stufigen Ticket-Status,
// den es bei uns so nicht gibt.

export interface ProjektKartenStats {
  offen: number
  inBearbeitung: number
  erledigt: number
  ticketsOffen: number
  ticketsUeberfaellig: number
}

function FortschrittsRing({ prozent }: { prozent: number }) {
  const radius = 32
  const umfang = 2 * Math.PI * radius
  const offset = umfang - (Math.min(100, Math.max(0, prozent)) / 100) * umfang
  return (
    <div className="relative h-20 w-20 flex-shrink-0">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="7" />
        {prozent > 0 && (
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="7"
            strokeDasharray={umfang}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-text">
        {prozent}%
      </div>
    </div>
  )
}

export function ProjektStatusKarte({
  projekt,
  stats,
  heutigerBerichtErstellt,
  istFavorit,
  onToggleFavorit,
}: {
  projekt: Projekt
  stats: ProjektKartenStats
  heutigerBerichtErstellt: boolean
  istFavorit: boolean
  onToggleFavorit: () => void
}) {
  const gesamtAufgaben = stats.offen + stats.inBearbeitung + stats.erledigt
  const prozent = gesamtAufgaben > 0 ? Math.round((stats.erledigt / gesamtAufgaben) * 100) : 0

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/projekte/${projekt.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {projekt.logo_pfad && (
              <SignedImage
                bucket="projekt-logos"
                path={projekt.logo_pfad}
                alt=""
                className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0">
              <div className="truncate text-lg font-bold text-text hover:text-brand">{projekt.name}</div>
              {formatProjektAdresse(projekt) && (
                <span
                  role="link"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    window.open(kartenUrl(formatProjektAdresse(projekt)!), '_blank', 'noreferrer')
                  }}
                  className="block truncate text-xs text-text-muted hover:text-brand hover:underline"
                >
                  📍 {formatProjektAdresse(projekt)}
                </span>
              )}
            </div>
          </div>
        </Link>
        <button
          onClick={onToggleFavorit}
          aria-label={istFavorit ? 'Favorit entfernen' : 'Als Favorit markieren'}
          className="flex-shrink-0 text-xl leading-none text-amber-500"
        >
          {istFavorit ? '★' : '☆'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
        <div>
          <div className="text-text-subtle">Projektnummer</div>
          <div className="truncate font-medium text-text">{projekt.projektnummer || 'nicht vorhanden'}</div>
        </div>
        <div>
          <div className="text-text-subtle">Projektstart</div>
          <div className="font-medium text-text">{projekt.projekt_beginn ? formatDatum(projekt.projekt_beginn) : 'nicht vorhanden'}</div>
        </div>
        <div>
          <div className="text-text-subtle">Projektende</div>
          <div className="font-medium text-text">{projekt.projekt_ende ? formatDatum(projekt.projekt_ende) : 'nicht vorhanden'}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs">
        <span className="text-text-muted">Heutiges Tagesbericht erstellt?</span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            heutigerBerichtErstellt
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
          }`}
        >
          {heutigerBerichtErstellt ? 'Ja' : 'Nein'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="border-l-2 border-red-500 pl-1.5">
          <div className="text-text-subtle">Stopp</div>
          <div className="font-semibold text-text">{stats.offen}</div>
        </div>
        <div className="border-l-2 border-amber-500 pl-1.5">
          <div className="text-text-subtle">In Arbeit</div>
          <div className="font-semibold text-text">{stats.inBearbeitung}</div>
        </div>
        <div className="border-l-2 border-emerald-500 pl-1.5">
          <div className="text-text-subtle">Abgeschlossen</div>
          <div className="font-semibold text-text">{stats.erledigt}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div className="flex gap-5">
          <div>
            <div className="text-2xl font-semibold text-text">{stats.ticketsOffen}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-text-subtle">Tickets offen</div>
          </div>
          <div>
            <div className={`text-2xl font-semibold ${stats.ticketsUeberfaellig > 0 ? 'text-red-600 dark:text-red-400' : 'text-text-subtle'}`}>
              {stats.ticketsUeberfaellig}
            </div>
            <div className="text-xs font-medium uppercase tracking-wide text-text-subtle">Überfällig</div>
          </div>
        </div>
        <FortschrittsRing prozent={prozent} />
      </div>
    </li>
  )
}
