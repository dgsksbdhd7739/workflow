import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { FUNKTION_LABEL, PAKETE, mindestPaket, type PaketFunktion } from '../lib/pakete'

// Hinweis statt Inhalt, wenn das Paket der Firma eine Funktion nicht enthaelt.
// Bewusst sichtbar statt ausgeblendet, damit klar ist, was ein Upgrade bringt.
export function PaketHinweis({ funktion, kompakt = false }: { funktion: PaketFunktion; kompakt?: boolean }) {
  const { paket, role } = useAuth()
  const ziel = PAKETE[mindestPaket(funktion)].label
  const text = `${FUNKTION_LABEL[funktion]} ist ab dem ${ziel}-Paket verfügbar.`
  if (kompakt) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-text-subtle">
        <Lock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.25} />
        {text}
      </p>
    )
  }
  return (
    <div className="card mx-auto max-w-md p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Lock className="h-5 w-5" strokeWidth={2.25} />
      </div>
      <h2 className="mb-1 font-semibold text-text">{text}</h2>
      <p className="text-sm text-text-muted">
        Deine Firma nutzt aktuell das {paket ? PAKETE[paket].label : ''}-Paket.{' '}
        {role === 'admin'
          ? 'Für ein Upgrade wende dich bitte an den WorkFlow-Support.'
          : 'Für ein Upgrade wende dich bitte an den Admin deiner Firma.'}
      </p>
    </div>
  )
}

export function PaketRoute({ funktion, children }: { funktion: PaketFunktion; children: ReactNode }) {
  const { hatFunktion } = useAuth()
  if (hatFunktion(funktion)) return <>{children}</>
  return (
    <div className="page">
      <PaketHinweis funktion={funktion} />
    </div>
  )
}
