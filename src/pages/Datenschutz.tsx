import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HardHat } from 'lucide-react'

// Oeffentlich erreichbare Seite (keine Route unter ProtectedRoute) -- eine
// Datenschutzerklaerung muss laut DSGVO ohne Login einsehbar sein, u. a.
// damit sie vor der Registrierung gelesen werden kann.
//
// WICHTIG fuer kuenftige Bearbeitung: Dies ist ein technisch auf Basis der
// tatsaechlich eingesetzten Dienste erstellter ERSTENTWURF, noch nicht
// anwaltlich geprueft. Vor jeder inhaltlichen Aenderung (neuer Dienst,
// neues Subprozessor, neue Datenkategorie) muss dieser Text aktualisiert
// werden, sonst stimmt er nicht mehr mit der tatsaechlichen Verarbeitung
// ueberein.

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold text-text">{titel}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-text-muted">{children}</div>
    </section>
  )
}

export function Datenschutz() {
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
            <Link to="/impressum" className="text-text-muted hover:text-brand hover:underline">
              Impressum
            </Link>
            <Link to="/login" className="text-brand hover:underline">
              Zur Anmeldung
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-1 text-2xl font-semibold text-text">Datenschutzerklärung</h1>
        <p className="mb-8 text-xs text-text-subtle">Stand: 1. Oktober 2026</p>

        <Abschnitt titel="1. Verantwortlicher">
          <p>Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
          <p>
            Mesut Hano
            <br />
            Karwendelstr. 4
            <br />
            86453 Dasing
            <br />
            Deutschland
            <br />
            E-Mail: Mesut.hano@gmail.com
          </p>
          <p>
            Ein gesonderter Datenschutzbeauftragter ist nicht bestellt; Anfragen zum Datenschutz richten Sie bitte an die
            oben genannte E-Mail-Adresse.
          </p>
        </Abschnitt>

        <Abschnitt titel="2. Überblick über Ihre Rechte als betroffene Person">
          <p>Sie haben jederzeit das Recht,</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Auskunft über Ihre bei uns verarbeiteten personenbezogenen Daten zu erhalten (Art. 15 DSGVO),</li>
            <li>die Berichtigung unrichtiger oder Vervollständigung unvollständiger Daten zu verlangen (Art. 16 DSGVO),</li>
            <li>die Löschung Ihrer bei uns gespeicherten Daten zu verlangen (Art. 17 DSGVO),</li>
            <li>die Einschränkung der Verarbeitung Ihrer Daten zu verlangen (Art. 18 DSGVO),</li>
            <li>Ihre bereitgestellten Daten in einem strukturierten, gängigen Format zu erhalten (Art. 20 DSGVO),</li>
            <li>
              einer zukünftigen Verarbeitung Ihrer Daten zu widersprechen, soweit diese auf Grundlage eines berechtigten
              Interesses erfolgt (Art. 21 DSGVO),
            </li>
            <li>eine erteilte Einwilligung jederzeit mit Wirkung für die Zukunft zu widerrufen (Art. 7 Abs. 3 DSGVO), sowie</li>
            <li>
              sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), z. B. beim Bayerischen Landesamt
              für Datenschutzaufsicht.
            </li>
          </ul>
        </Abschnitt>

        <Abschnitt titel="3. Allgemeine Informationen beim Aufruf der Webseite und App">
          <p>
            Beim Aufruf von workflow-app.de bzw. app.workflow-app.de sowie bei jeder Anfrage an die App verarbeitet der
            jeweilige Hostinganbieter technisch notwendig sogenannte Server-Logfiles, u. a. IP-Adresse, Datum und
            Uhrzeit der Anfrage, aufgerufene Seite/Ressource, übertragene Datenmenge, Browsertyp und -version sowie das
            verwendete Betriebssystem. Diese Daten werden ausschließlich zur Gewährleistung eines störungsfreien
            Betriebs, zur Auslastungskontrolle und zur Abwehr von Angriffen verarbeitet (Art. 6 Abs. 1 lit. f DSGVO,
            berechtigtes Interesse an Betriebssicherheit) und nach kurzer Zeit automatisch gelöscht.
          </p>
          <p>Hosting erfolgt über:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>App (app.workflow-app.de): eigener Server bei STRATO AG, Pascalstraße 10, 10587 Berlin, Deutschland,</li>
            <li>
              Landingpage (workflow-app.de): Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA (Hosting über
              Content-Delivery-Netzwerk, ggf. mit Serverstandorten außerhalb der EU, siehe Abschnitt 8).
            </li>
          </ul>
        </Abschnitt>

        <Abschnitt titel="4. Registrierung und Nutzerkonto">
          <p>
            Der Zugang zu WorkFlow erfolgt ausschließlich über ein persönliches Nutzerkonto, das von Ihrem Unternehmen
            bzw. dessen Administrator für Sie angelegt wird (keine öffentliche Selbstregistrierung). Dabei werden
            folgende Daten verarbeitet:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Name, E-Mail-Adresse, Passwort (verschlüsselt gespeichert, für uns nicht einsehbar),</li>
            <li>Rolle im Unternehmen (z. B. Admin, Planer, Techniker, Kunde) sowie Zugehörigkeit zum Unternehmen,</li>
            <li>optional: Telefonnummer, Positionsbezeichnung, Anschrift, sofern Sie diese im Profil hinterlegen.</li>
          </ul>
          <p>
            Rechtsgrundlage ist die Erfüllung des Nutzungsvertrags zwischen Ihrem Unternehmen und uns bzw. zwischen
            Ihnen und Ihrem Unternehmen (Art. 6 Abs. 1 lit. b DSGVO).
          </p>
        </Abschnitt>

        <Abschnitt titel="5. Im Rahmen der Projektnutzung verarbeitete Daten">
          <p>
            WorkFlow ist eine Projektmanagement-Software für Bau-/Handwerksbetriebe. Im Rahmen der Nutzung werden je
            nach Einsatz folgende Datenkategorien verarbeitet, jeweils streng getrennt je Unternehmen (Mandantentrennung
            auf Datenbankebene):
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Projekt-, Aufgaben- und Ticketdaten (Titel, Beschreibung, Status, Fristen, Priorität, Zuständigkeit),</li>
            <li>hochgeladene Dokumente, Pläne und Fotos (z. B. Baustellenfotos, Schaltpläne),</li>
            <li>Tagesberichte/Bautagebuch (Datum, Personalanzahl, Tätigkeiten, Besonderheiten),</li>
            <li>Zeiterfassungsdaten (Datum, Beginn/Ende, Pausen, zugeordnete Tätigkeit),</li>
            <li>Chat-Nachrichten in Team- und Projekt-Chats,</li>
            <li>Materialstamm- und Materialverwendungsdaten.</li>
          </ul>
          <p>
            Diese Daten werden ausschließlich zur Abwicklung der Projekt-/Bauarbeiten im Auftrag des jeweiligen
            Unternehmens verarbeitet (Art. 6 Abs. 1 lit. b, f DSGVO) und sind für andere Unternehmen auf derselben
            Plattform technisch nicht einsehbar.
          </p>
        </Abschnitt>

        <Abschnitt titel="6. Zwei-Faktor-Authentifizierung (optional)">
          <p>
            Sie können Ihr Konto optional durch eine Zwei-Faktor-Authentifizierung (TOTP, z. B. über Google
            Authenticator) zusätzlich absichern. Hierbei wird ein geheimer Schlüssel für Ihr Konto erzeugt und bei
            unserem Auftragsverarbeiter (siehe Abschnitt 9) gespeichert. Die Aktivierung erfolgt freiwillig auf Ihre
            Veranlassung (Art. 6 Abs. 1 lit. a DSGVO); Sie können die Funktion jederzeit in den Einstellungen wieder
            deaktivieren.
          </p>
        </Abschnitt>

        <Abschnitt titel="7. Geräte- und Sitzungsübersicht">
          <p>
            Zur Anzeige der unter „Einstellungen → Sicherheit → Angemeldete Geräte" sichtbaren Übersicht wird je von
            Ihnen genutztem Gerät eine zufällige Kennung (gespeichert im lokalen Browserspeicher) zusammen mit einer
            groben, aus dem Browser abgeleiteten Gerätebezeichnung (z. B. „Chrome auf Windows") und dem Zeitpunkt des
            letzten Zugriffs gespeichert. Zweck ist die Erkennung unbefugter Zugriffe und die Möglichkeit, sich von
            anderen Geräten abzumelden (Art. 6 Abs. 1 lit. f DSGVO, berechtigtes Interesse an Kontosicherheit).
          </p>
        </Abschnitt>

        <Abschnitt titel="8. Cookies und lokale Speicherung">
          <p>
            WorkFlow verwendet keine Marketing- oder Analyse-Cookies und keine Tracking- oder Analysedienste (z. B.
            Google Analytics). Zur technischen Funktion der Anwendung wird der Browser-eigene lokale Speicher
            („localStorage") für folgende, technisch notwendige Zwecke genutzt:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Ihre Anmeldesitzung (Sitzungstoken, ausgestellt von unserem Auftragsverarbeiter für die Anmeldung),</li>
            <li>die gewählte Darstellung (helles/dunkles Farbschema),</li>
            <li>die zufällige Gerätekennung gemäß Abschnitt 7,</li>
            <li>die zuletzt gesehene Programmversion, um „Was ist neu"-Hinweise nur einmalig anzuzeigen.</li>
          </ul>
          <p>
            Diese Speicherung ist gemäß § 25 Abs. 2 Nr. 2 TTDSG zulässig, da sie zur Bereitstellung des von Ihnen
            ausdrücklich gewünschten Telemediendienstes unbedingt erforderlich ist; eine gesonderte Einwilligung ist
            dafür nicht erforderlich.
          </p>
        </Abschnitt>

        <Abschnitt titel="9. Weitergabe an Auftragsverarbeiter / Empfänger">
          <p>
            Zur Erbringung unserer Leistungen setzen wir folgende Auftragsverarbeiter und Dienste ein, mit denen,
            soweit gesetzlich erforderlich, Verträge zur Auftragsverarbeitung (Art. 28 DSGVO) bestehen bzw. abzuschließen
            sind:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Supabase, Inc.</strong> (970 Toa Payoh North #07-04, Singapur, mit Datenverarbeitung über AWS
              Rechenzentren in Frankfurt am Main, Deutschland) — Datenbank, Authentifizierung und Dateispeicher (u. a.
              Dokumente, Fotos, Pläne); zentraler Dienstleister für nahezu alle in dieser Erklärung genannten Daten.
            </li>
            <li>
              <strong>STRATO AG</strong> (Pascalstraße 10, 10587 Berlin, Deutschland) — Serverbetrieb der Web-App
              (app.workflow-app.de).
            </li>
            <li>
              <strong>Vercel Inc.</strong> (USA) — Hosting der Informations-/Landingpage (workflow-app.de).
            </li>
            <li>
              <strong>Capgo</strong> — Auslieferung von Programm-Updates an die mobile App (keine personenbezogenen
              Nutzerdaten, nur Programmcode).
            </li>
            <li>
              <strong>Google LLC</strong> (Firebase Cloud Messaging) und <strong>Apple Inc.</strong> (Apple Push
              Notification Service) — ausschließlich bei aktivierten Push-Benachrichtigungen in der mobilen App, zur
              Zustellung von Benachrichtigungen über neue Chat-Nachrichten.
            </li>
          </ul>
          <p>Eine Weitergabe an sonstige Dritte, insbesondere zu Werbezwecken, findet nicht statt.</p>
        </Abschnitt>

        <Abschnitt titel="10. Datenübermittlung in Drittländer">
          <p>
            Einzelne der in Abschnitt 9 genannten Dienstleister haben ihren Sitz oder Serverstandorte außerhalb der
            EU/des EWR (insbesondere USA, Vercel/Google/Apple; Singapur als Unternehmenssitz von Supabase, Inc., bei
            Datenverarbeitung in der EU). Soweit personenbezogene Daten dabei in Drittländer ohne Angemessenheitsbeschluss
            der EU-Kommission übermittelt werden, stützen wir dies auf die EU-Standardvertragsklauseln gemäß Art. 46
            Abs. 2 lit. c DSGVO mit dem jeweiligen Anbieter.
          </p>
        </Abschnitt>

        <Abschnitt titel="11. Speicherdauer">
          <p>
            Wir speichern personenbezogene Daten nur so lange, wie dies für die jeweiligen Zwecke erforderlich ist,
            insbesondere für die Dauer der Nutzung Ihres Kontos und des Vertragsverhältnisses zwischen Ihnen bzw. Ihrem
            Unternehmen und uns. Nach Beendigung der Nutzung bzw. auf Löschungsverlangen werden Daten gelöscht, soweit
            keine gesetzlichen Aufbewahrungspflichten (z. B. handels- oder steuerrechtliche Fristen) entgegenstehen.
          </p>
        </Abschnitt>

        <Abschnitt titel="12. Datensicherheit">
          <p>
            Die Übertragung Ihrer Daten erfolgt stets verschlüsselt über TLS/SSL. Der Zugriff auf Daten innerhalb der
            Datenbank ist durch feingranulare Zugriffsregeln (Row-Level-Security) technisch so eingeschränkt, dass
            jedes Unternehmen ausschließlich auf seine eigenen Daten zugreifen kann. Passwörter werden ausschließlich
            in gehashter, nicht umkehrbarer Form gespeichert. Für Konten steht optional eine Zwei-Faktor-Authentifizierung
            zur Verfügung.
          </p>
        </Abschnitt>

        <Abschnitt titel="13. Änderungen dieser Datenschutzerklärung">
          <p>
            Wir passen diese Datenschutzerklärung an, sobald sich die Art der verarbeiteten Daten, eingesetzte
            Dienstleister oder die Rechtslage ändern. Es gilt jeweils die zum Zeitpunkt Ihres Besuchs aktuelle, auf
            dieser Seite veröffentlichte Fassung.
          </p>
        </Abschnitt>

        <Abschnitt titel="14. Kontakt">
          <p>
            Für Fragen zum Datenschutz sowie zur Geltendmachung Ihrer Rechte wenden Sie sich bitte an:{' '}
            <a href="mailto:Mesut.hano@gmail.com" className="text-brand hover:underline">
              Mesut.hano@gmail.com
            </a>
          </p>
        </Abschnitt>
      </div>
    </div>
  )
}
