import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HardHat } from 'lucide-react'

// Oeffentlich erreichbare Seite (keine Route unter ProtectedRoute), analog
// zu Datenschutz.tsx. Angaben gemaess § 5 TMG / § 18 Abs. 1 MStV.
//
// WICHTIG fuer kuenftige Bearbeitung: Betreiber ist Mesut Hano als
// Privatperson, kein Gewerbe angemeldet (Stand 2026-10-01, siehe Memory
// project_legal_texts). Sobald sich das aendert (Gewerbeanmeldung, GmbH,
// USt-IdNr.), muss dieser Text entsprechend ergaenzt werden.

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold text-text">{titel}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-text-muted">{children}</div>
    </section>
  )
}

export function Impressum() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-text">
            <div className="logo-tile h-7 w-7 shrink-0">
              <HardHat className="h-3.5 w-3.5" strokeWidth={2.25} />
            </div>
            Work<span className="brand-text">Flow</span>
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link to="/datenschutz" className="text-text-muted hover:text-brand hover:underline">
              Datenschutz
            </Link>
            <Link to="/login" className="text-brand hover:underline">
              Zur Anmeldung
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 text-2xl font-semibold text-text">Impressum</h1>
        <p className="mb-8 text-xs text-text-subtle">Stand: 1. Oktober 2026</p>

        <Abschnitt titel="Angaben gemäß § 5 TMG / § 18 Abs. 1 MStV">
          <p>
            Mesut Hano
            <br />
            Karwendelstr. 4
            <br />
            86453 Dasing
            <br />
            Deutschland
          </p>
        </Abschnitt>

        <Abschnitt titel="Kontakt">
          <p>
            E-Mail:{' '}
            <a href="mailto:Mesut.hano@gmail.com" className="text-brand hover:underline">
              Mesut.hano@gmail.com
            </a>
          </p>
        </Abschnitt>

        <Abschnitt titel="Umsatzsteuer">
          <p>
            Es liegt derzeit keine Gewerbeanmeldung vor; WorkFlow wird im Rahmen eines privaten Entwicklungsprojekts
            betrieben. Eine Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG ist daher nicht vorhanden.
          </p>
        </Abschnitt>

        <Abschnitt titel="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
          <p>
            Mesut Hano
            <br />
            Karwendelstr. 4
            <br />
            86453 Dasing
          </p>
        </Abschnitt>

        <Abschnitt titel="Haftung für Inhalte">
          <p>
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen
            Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet,
            übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf
            eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von
            Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist
            jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von
            entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
          </p>
        </Abschnitt>

        <Abschnitt titel="Haftung für Links">
          <p>
            Unser Angebot kann Links zu externen Webseiten Dritter enthalten, auf deren Inhalte wir keinen Einfluss
            haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der
            verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten
            Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte
            waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten
            Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von
            Rechtsverletzungen werden wir derartige Links umgehend entfernen.
          </p>
        </Abschnitt>

        <Abschnitt titel="Urheberrecht">
          <p>
            Die durch den Betreiber dieser Anwendung erstellten Inhalte und Werke, einschließlich Quellcode, Design,
            Konzept und Funktionsumfang von WorkFlow, unterliegen dem deutschen Urheberrecht. Die Vervielfältigung,
            Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der
            schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite bzw. der
            Anwendung sind nur für den privaten, nicht kommerziellen Gebrauch gestattet. Soweit die Inhalte auf dieser
            Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte Dritter beachtet. Sollten Sie trotzdem
            auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis an die oben
            genannte Kontaktadresse. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Inhalte umgehend
            entfernen.
          </p>
        </Abschnitt>
      </div>
    </div>
  )
}
