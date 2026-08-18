import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { holeUngeseheneEintraege, markiereAlsGesehen, type ChangelogEintrag } from '../lib/changelog'
import { formatDatum } from '../lib/datum'

export function ChangelogDialog() {
  const { user } = useAuth()
  const [eintraege, setEintraege] = useState<ChangelogEintrag[]>([])

  useEffect(() => {
    if (user) setEintraege(holeUngeseheneEintraege(__APP_VERSION__))
  }, [user])

  if (!user || eintraege.length === 0) return null

  const schliessen = () => {
    markiereAlsGesehen(__APP_VERSION__)
    setEintraege([])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={schliessen}>
      <div
        className="card w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="logo-tile h-9 w-9 shrink-0">
              <Sparkles className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">Was ist neu</h2>
              <p className="text-xs text-text-subtle">Version {__APP_VERSION__}</p>
            </div>
          </div>
          <button onClick={schliessen} aria-label="Schließen" className="text-text-subtle hover:text-text">
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {eintraege.map((eintrag) => (
            <div key={eintrag.version}>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-text-subtle">
                <span>Version {eintrag.version}</span>
                <span>·</span>
                <span>{formatDatum(eintrag.datum)}</span>
              </div>
              <ul className="space-y-1.5">
                {eintrag.aenderungen.map((zeile, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text">
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-brand" />
                    {zeile}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <button onClick={schliessen} className="btn-primary mt-4 w-full">
          Verstanden
        </button>
      </div>
    </div>
  )
}
