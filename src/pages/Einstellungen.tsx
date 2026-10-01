import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../hooks/useTheme'
import { CHANGELOG } from '../lib/changelog'
import { formatDatum } from '../lib/datum'
import { UnternehmenForm } from '../components/UnternehmenForm'
import { ProfilForm } from '../components/ProfilForm'
import { ZweiFaktorEinstellungen } from '../components/ZweiFaktorEinstellungen'
import { AngemeldeteGeraete } from '../components/AngemeldeteGeraete'

const rollenLabel: Record<string, string> = {
  admin: 'Admin',
  planer: 'Planer',
  techniker: 'Techniker',
  kunde: 'Kunde (Zuschauer)',
}

type SectionId =
  | 'konto'
  | 'profil'
  | 'sicherheit'
  | 'datenschutz'
  | 'darstellung'
  | 'verwaltung'
  | 'unternehmen'
  | 'ueber-workflow'

// Entspricht Tailwinds md-Breakpoint (Seitenleiste ab 768px sichtbar).
const MOBIL_QUERY = '(max-width: 767px)'

// "Ueber WorkFlow" zeigt standardmaessig nur die letzten Versionen.
const CHANGELOG_KURZ = 5

export function Einstellungen() {
  const { user, role, signOut, setOnboardingGesehen, produktHinweise, setProduktHinweise } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { hash } = useLocation()
  const kannVerwalten = role === 'admin' || role === 'planer'

  const sections: { id: SectionId; label: string; sichtbar: boolean }[] = [
    { id: 'konto', label: 'Konto', sichtbar: true },
    { id: 'profil', label: 'Profil & persönliche Einstellungen', sichtbar: true },
    { id: 'sicherheit', label: 'Sicherheit', sichtbar: true },
    { id: 'datenschutz', label: 'Datenschutz & Hinweise', sichtbar: true },
    { id: 'darstellung', label: 'Darstellung', sichtbar: true },
    { id: 'verwaltung', label: 'Verwaltung', sichtbar: kannVerwalten },
    { id: 'unternehmen', label: 'Unternehmen', sichtbar: kannVerwalten },
    { id: 'ueber-workflow', label: 'Über WorkFlow', sichtbar: true },
  ]
  const sichtbareSections = sections.filter((s) => s.sichtbar)

  // Desktop: Beim Aufruf ohne (oder mit unbekannter/nicht sichtbarer)
  // Sprungmarke immer mit "Konto" starten, statt alle Bereiche untereinander
  // zu zeigen -- die Auswahl laeuft ueber den Strukturbaum der Seitenleiste.
  const angefordert = hash.slice(1) as SectionId
  const aktivId: SectionId = sichtbareSections.some((s) => s.id === angefordert) ? angefordert : 'konto'

  // Mobil/App: Die Seitenleiste (und damit der Strukturbaum) ist unterhalb
  // von md ausgeblendet, es gaebe also keinen Weg zu den anderen Bereichen --
  // dort alle Bereiche untereinander zeigen.
  const [istMobil, setIstMobil] = useState(() => window.matchMedia(MOBIL_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBIL_QUERY)
    const aendern = () => setIstMobil(mq.matches)
    mq.addEventListener('change', aendern)
    return () => mq.removeEventListener('change', aendern)
  }, [])
  const zeigen = (id: SectionId) => istMobil || aktivId === id
  const [alleVersionen, setAlleVersionen] = useState(false)

  const toggleProduktHinweise = async () => {
    const neuerWert = !produktHinweise
    setProduktHinweise(neuerWert)
    if (user) {
      await supabase.from('profiles').update({ produkt_hinweise: neuerWert }).eq('id', user.id)
    }
  }

  return (
    <div className="page max-w-xl">
      <h1 className="mb-4 text-xl font-semibold text-text">Einstellungen</h1>

      {zeigen('konto') && (
        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Konto</h2>
          <div className="mb-4 space-y-1 text-sm">
            <div className="text-text">{user?.email}</div>
            {role && <div className="text-text-muted">Rolle: {rollenLabel[role] ?? role}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/passwort-aendern" className="btn-secondary">
              Passwort ändern
            </Link>
            <button onClick={() => setOnboardingGesehen(false)} className="btn-secondary">
              <Sparkles className="h-4 w-4" strokeWidth={2.25} />
              Tutorial erneut anzeigen
            </button>
            <button onClick={() => signOut()} className="btn-secondary text-red-600 dark:text-red-400">
              <LogOut className="h-4 w-4" strokeWidth={2.25} />
              Abmelden
            </button>
          </div>
        </section>
      )}

      {zeigen('profil') && (
        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Profil & persönliche Einstellungen</h2>
          <ProfilForm />
        </section>
      )}

      {zeigen('sicherheit') && (
        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Sicherheit</h2>
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">Zwei-Faktor-Authentifizierung</h3>
              <ZweiFaktorEinstellungen />
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">Angemeldete Geräte</h3>
              <AngemeldeteGeraete />
            </div>
          </div>
        </section>
      )}

      {zeigen('datenschutz') && (
        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Datenschutz & Hinweise</h2>
          <p className="mb-3 text-xs text-text-muted">
            WorkFlow speichert nur die Daten, die du selbst im Profil hinterlegst, sowie deine Arbeitsdaten innerhalb deines
            Unternehmens. Es gibt keine Weitergabe an Dritte und keinen Newsletter.
          </p>
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span className="text-text">„Was ist neu"-Hinweise nach Updates automatisch anzeigen</span>
            <input
              type="checkbox"
              checked={produktHinweise}
              onChange={toggleProduktHinweise}
              className="h-4 w-4 flex-shrink-0"
            />
          </label>
        </section>
      )}

      {zeigen('darstellung') && (
        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Darstellung</h2>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-text-muted">Farbschema</div>
            <div className="flex overflow-hidden rounded-lg border border-border-strong text-sm">
              <button
                onClick={() => theme !== 'light' && toggleTheme()}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  theme === 'light' ? 'bg-brand-soft text-brand-text' : 'text-text-muted hover:bg-surface-hover'
                }`}
              >
                ☀️ Hell
              </button>
              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  theme === 'dark' ? 'bg-brand-soft text-brand-text' : 'text-text-muted hover:bg-surface-hover'
                }`}
              >
                🌙 Dunkel
              </button>
            </div>
          </div>
        </section>
      )}

      {kannVerwalten && zeigen('verwaltung') && (
        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Verwaltung</h2>
          {role === 'admin' && (
            <Link
              to="/nutzer"
              className="flex items-center justify-between rounded-lg px-1 py-1 text-sm text-text-muted hover:text-brand"
            >
              <span>👥 Nutzer</span>
              <span aria-hidden>›</span>
            </Link>
          )}
          <Link
            to="/statusvorlagen"
            className="flex items-center justify-between rounded-lg px-1 py-1 text-sm text-text-muted hover:text-brand"
          >
            <span>🏷️ Statusvorlagen</span>
            <span aria-hidden>›</span>
          </Link>
          <Link
            to="/material-stamm"
            className="flex items-center justify-between rounded-lg px-1 py-1 text-sm text-text-muted hover:text-brand"
          >
            <span>📦 Materialstamm</span>
            <span aria-hidden>›</span>
          </Link>
          <Link
            to="/ticket-formulare"
            className="flex items-center justify-between rounded-lg px-1 py-1 text-sm text-text-muted hover:text-brand"
          >
            <span>📋 Ticket-Formulare</span>
            <span aria-hidden>›</span>
          </Link>
          <Link
            to="/tagesbericht-vorlagen"
            className="flex items-center justify-between rounded-lg px-1 py-1 text-sm text-text-muted hover:text-brand"
          >
            <span>📰 Tagesbericht-Vorlagen</span>
            <span aria-hidden>›</span>
          </Link>
        </section>
      )}

      {kannVerwalten && zeigen('unternehmen') && (
        <section className="card mb-4 p-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Unternehmen</h2>
          <UnternehmenForm />
        </section>
      )}

      {zeigen('ueber-workflow') && (
        <section className="card mb-4 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-text">Über WorkFlow</h2>
            <span className="text-xs text-text-subtle">Version {__APP_VERSION__}</span>
          </div>
          <div className="space-y-4">
            {(alleVersionen ? CHANGELOG : CHANGELOG.slice(0, CHANGELOG_KURZ)).map((eintrag) => (
              <div key={eintrag.version}>
                <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-text-subtle">
                  <span>Version {eintrag.version}</span>
                  <span>·</span>
                  <span>{formatDatum(eintrag.datum)}</span>
                </div>
                <ul className="space-y-1">
                  {eintrag.aenderungen.map((zeile, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-brand" />
                      {zeile}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {CHANGELOG.length > CHANGELOG_KURZ && (
            <button onClick={() => setAlleVersionen((v) => !v)} className="btn-ghost mt-3 text-xs">
              {alleVersionen ? 'Weniger anzeigen' : `Ältere Versionen anzeigen (${CHANGELOG.length - CHANGELOG_KURZ})`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
