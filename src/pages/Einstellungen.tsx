import { useEffect } from 'react'
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

export function Einstellungen() {
  const { user, role, signOut, setOnboardingGesehen, produktHinweise, setProduktHinweise } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { hash } = useLocation()
  const kannVerwalten = role === 'admin' || role === 'planer'

  // Springt beim Aufruf per Sprungmarke (aus dem Einstellungen-Strukturbaum
  // in der Seitenleiste) zur jeweiligen Section -- React Router scrollt bei
  // Hash-Links anders als eine klassische Mehrseiten-Navigation nicht von
  // selbst dorthin.
  useEffect(() => {
    if (!hash) return
    const ziel = document.getElementById(hash.slice(1))
    ziel?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const toggleProduktHinweise = async () => {
    const neuerWert = !produktHinweise
    setProduktHinweise(neuerWert)
    if (user) {
      await supabase.from('profiles').update({ produkt_hinweise: neuerWert }).eq('id', user.id)
    }
  }

  return (
    <div className="page max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-text">Einstellungen</h1>

      <section id="konto" className="card mb-4 p-4 scroll-mt-4">
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

      <section id="profil" className="card mb-4 p-4 scroll-mt-4">
        <h2 className="mb-3 text-sm font-semibold text-text">Profil & persönliche Einstellungen</h2>
        <ProfilForm />
      </section>

      <section id="sicherheit" className="card mb-4 p-4 scroll-mt-4">
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

      <section id="datenschutz" className="card mb-4 p-4 scroll-mt-4">
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

      <section id="darstellung" className="card mb-4 p-4 scroll-mt-4">
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

      {kannVerwalten && (
        <section id="verwaltung" className="card mb-4 p-4 scroll-mt-4">
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

      {kannVerwalten && (
        <section id="unternehmen" className="card mb-4 p-4 scroll-mt-4">
          <h2 className="mb-3 text-sm font-semibold text-text">Unternehmen</h2>
          <UnternehmenForm />
        </section>
      )}

      <section id="ueber-workflow" className="card p-4 scroll-mt-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-text">Über WorkFlow</h2>
          <span className="text-xs text-text-subtle">Version {__APP_VERSION__}</span>
        </div>
        <div className="space-y-4">
          {CHANGELOG.map((eintrag) => (
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
      </section>
    </div>
  )
}
