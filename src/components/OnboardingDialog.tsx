import { useState } from 'react'
import { ClipboardList, HardHat, ListChecks, MapIcon, MessageSquare, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

interface Schritt {
  titel: string
  text: string
  icon: LucideIcon
}

const schritte: Schritt[] = [
  {
    titel: 'Willkommen bei WorkFlow',
    text: 'Eine kurze Einführung in die wichtigsten Bereiche der App — dauert nur eine Minute.',
    icon: HardHat,
  },
  {
    titel: 'Baustellen & Aufgaben',
    text: 'Auf der Startseite siehst du alle Baustellen. In einer Baustelle verwaltest du Aufgaben (Mängel) mit Status, Fotos und Position auf dem Plan.',
    icon: ListChecks,
  },
  {
    titel: 'Tagesberichte & Zeiterfassung',
    text: 'Tagesberichte dokumentieren, was an einem Tag erledigt wurde. Zeiterfassung protokolliert die Arbeitszeit je Mitarbeiter und Baustelle.',
    icon: ClipboardList,
  },
  {
    titel: 'Pläne & Dokumente',
    text: 'Lade Baupläne hoch und markiere Positionen direkt darauf. Sonstige Unterlagen findest du unter Dokumente.',
    icon: MapIcon,
  },
  {
    titel: 'Team-Chat & Hilfe',
    text: 'Über den Team- und Projekt-Chat bleibt ihr in Kontakt. Diese Anleitung findest du jederzeit erneut über die Hilfe-Seite in der Navigation.',
    icon: MessageSquare,
  },
]

export function OnboardingDialog() {
  const { user, setOnboardingGesehen } = useAuth()
  const [index, setIndex] = useState(0)

  const abschliessen = async () => {
    setOnboardingGesehen(true)
    if (user) {
      await supabase.from('profiles').update({ onboarding_gesehen: true }).eq('id', user.id)
    }
  }

  const letzterSchritt = index === schritte.length - 1
  const aktuell = schritte[index]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="card w-full max-w-sm p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="logo-tile h-9 w-9 shrink-0">
              <aktuell.icon className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <h2 className="text-base font-semibold text-text">{aktuell.titel}</h2>
          </div>
          <button onClick={abschliessen} aria-label="Überspringen" className="text-text-subtle hover:text-text">
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <p className="min-h-16 text-sm text-text-muted">{aktuell.text}</p>

        <div className="mt-4 mb-4 flex items-center justify-center gap-1.5">
          {schritte.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-brand' : 'bg-border-strong'}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {index > 0 && (
            <button onClick={() => setIndex((i) => i - 1)} className="btn-secondary">
              Zurück
            </button>
          )}
          <button
            onClick={() => (letzterSchritt ? abschliessen() : setIndex((i) => i + 1))}
            className="btn-primary flex-1"
          >
            {letzterSchritt ? 'Los geht’s' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  )
}
