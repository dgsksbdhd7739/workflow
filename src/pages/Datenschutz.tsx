import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HardHat } from 'lucide-react'

// Oeffentlich erreichbare Seite (keine Route unter ProtectedRoute) -- eine
// Datenschutzerklaerung muss laut DSGVO ohne Login einsehbar sein, u. a.
// damit sie vor der Registrierung gelesen werden kann.
//
// WICHTIG fuer kuenftige Bearbeitung: Dieser Text ist technisch gegen die
// tatsaechlich eingesetzten Dienste geprueft, aber noch NICHT anwaltlich
// geprueft. Vor jeder inhaltlichen Aenderung (neuer Dienst, neuer
// Subprozessor, neue Datenkategorie, neue App-Berechtigung) muss dieser Text
// aktualisiert werden, sonst stimmt er nicht mehr mit der tatsaechlichen
// Verarbeitung ueberein. Stand der Pruefung (Oktober 2026):
// - Supabase-Projekt in eu-central-1 (Frankfurt)
// - Live-Updates laden aus dem eigenen Supabase-Speicher (Capgo nur als
//   Open-Source-Plugin, kein Capgo-Clouddienst)
// - keine iOS-App, Push nur Android/FCM und nur fuer den Team-Chat
// - Android-Manifest: nur INTERNET; Mitteilungen fragt das Push-Plugin ab,
//   Fotos/Dateien kommen ueber die System-Dateiauswahl
// - nginx-Logs auf dem VPS: logrotate daily, rotate 14

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-lg font-semibold text-text">{titel}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-text-muted">{children}</div>
    </section>
  )
}

function Liste({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-5">{children}</ul>
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
        <p className="mb-8 text-xs text-text-subtle">Stand: Oktober 2026</p>

        <Abschnitt titel="1. Verantwortlicher">
          <p>
            Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) und sonstiger nationaler
            Datenschutzgesetze ist:
          </p>
          <p>
            Mesut Hano
            <br />
            Karwendelstr. 4
            <br />
            86453 Dasing
            <br />
            Deutschland
            <br />
            E-Mail:{' '}
            <a href="mailto:Mesut.hano@gmail.com" className="text-brand hover:underline">
              Mesut.hano@gmail.com
            </a>
            <br />
            Telefon: +49 179 7007240
          </p>
          <p>
            Ein betrieblicher Datenschutzbeauftragter ist gesetzlich nicht erforderlich und nicht bestellt. Bei Fragen
            zur Verarbeitung Ihrer personenbezogenen Daten wenden Sie sich bitte direkt an die oben genannte
            Kontaktadresse.
          </p>
        </Abschnitt>

        <Abschnitt titel="2. Eigene Datenverarbeitung und Auftragsverarbeitung (Art. 28 DSGVO)">
          <p>
            WorkFlow ist eine B2B-Plattform zur Projekt- und Einsatzkoordination für Handwerks- und Bauunternehmen. Dabei
            treten wir in zwei unterschiedlichen Rollen auf:
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Als Verantwortlicher (Art. 4 Nr. 7 DSGVO)</strong> für den Betrieb der Webseiten (workflow-app.de,
              app.workflow-app.de), die Bereitstellung der Apps, die Führung der Kundenstammdaten sowie die
              Nutzerverwaltung und Anmeldung.
            </li>
            <li>
              <strong>Als Auftragsverarbeiter (Art. 28 DSGVO)</strong>, soweit Unternehmen („Kunden“) projektbezogene
              Inhalte in WorkFlow einpflegen (z. B. Baustellendaten, Aufgaben, Dokumente, Bautagebücher, Arbeitszeiten
              von Mitarbeitern oder Chatverläufe). Diese Daten verarbeiten wir ausschließlich weisungsgebunden im Auftrag
              des jeweiligen Kunden; der Kunde bleibt für diese Inhaltsdaten allein verantwortlich. Hierzu wird mit dem
              Kunden ein gesonderter Vertrag zur Auftragsverarbeitung (AVV) gemäß Art. 28 DSGVO geschlossen. Betroffene
              Personen (z. B. Mitarbeiter oder Auftraggeber der Betriebe) wenden sich zu diesen Inhaltsdaten bitte
              vorrangig an das jeweilige Unternehmen.
            </li>
          </ol>
        </Abschnitt>

        <Abschnitt titel="3. Ihre Rechte als betroffene Person">
          <p>Soweit wir für die Datenverarbeitung verantwortlich sind, haben Sie nach der DSGVO folgende Rechte:</p>
          <Liste>
            <li>
              <strong>Auskunft (Art. 15 DSGVO):</strong> Auskunft über Ihre von uns verarbeiteten personenbezogenen
              Daten.
            </li>
            <li>
              <strong>Berichtigung (Art. 16 DSGVO):</strong> unverzügliche Berichtigung unrichtiger oder Vervollständigung
              unvollständiger Daten.
            </li>
            <li>
              <strong>Löschung (Art. 17 DSGVO):</strong> Löschung Ihrer Daten, sofern keine gesetzlichen
              Aufbewahrungspflichten oder überwiegenden berechtigten Interessen entgegenstehen.
            </li>
            <li>
              <strong>Einschränkung der Verarbeitung (Art. 18 DSGVO):</strong> z. B. wenn die Richtigkeit der Daten
              bestritten wird oder die Verarbeitung unrechtmäßig ist.
            </li>
            <li>
              <strong>Datenübertragbarkeit (Art. 20 DSGVO):</strong> Herausgabe der von Ihnen bereitgestellten Daten in
              einem strukturierten, gängigen und maschinenlesbaren Format.
            </li>
            <li>
              <strong>Widerspruch (Art. 21 DSGVO):</strong> gegen Verarbeitungen auf Grundlage eines berechtigten
              Interesses (Art. 6 Abs. 1 lit. f DSGVO), aus Gründen, die sich aus Ihrer besonderen Situation ergeben.
            </li>
            <li>
              <strong>Widerruf einer Einwilligung (Art. 7 Abs. 3 DSGVO):</strong> jederzeit mit Wirkung für die Zukunft.
            </li>
            <li>
              <strong>Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO),</strong> insbesondere im Mitgliedstaat
              Ihres Aufenthaltsorts oder des Orts des mutmaßlichen Verstoßes. Für uns zuständig ist das Bayerische
              Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach,{' '}
              <a href="https://www.lda.bayern.de" target="_blank" rel="noreferrer" className="text-brand hover:underline">
                www.lda.bayern.de
              </a>
              .
            </li>
          </Liste>
        </Abschnitt>

        <Abschnitt titel="4. Bereitstellung der Webseite, Web-App und Server-Logfiles">
          <p>
            Beim Aufruf unserer Dienste verarbeiten die eingesetzten Server technisch notwendige Verbindungsdaten
            (Server-Logfiles):
          </p>
          <Liste>
            <li>IP-Adresse des anfragenden Geräts,</li>
            <li>Datum und Uhrzeit des Zugriffs,</li>
            <li>aufgerufene Ressource/URL,</li>
            <li>übertragene Datenmenge und HTTP-Statuscode,</li>
            <li>Browsertyp, Browserversion und Betriebssystem.</li>
          </Liste>
          <p>
            <strong>Zweck und Rechtsgrundlage:</strong> technische Stabilität, Auslastungssteuerung, Fehleranalyse und
            Abwehr von Angriffen. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und zuverlässigen
            Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Die Logdaten auf unserem eigenen Server werden nach spätestens 14
            Tagen automatisch gelöscht; bei den unten genannten Dienstleistern gelten deren Löschfristen.
          </p>
          <p>
            <strong>Eingesetzte Hoster:</strong>
          </p>
          <Liste>
            <li>
              Web-App (app.workflow-app.de): eigener Server bei der STRATO AG, Pascalstraße 10, 10587 Berlin,
              Deutschland (Serverstandort Deutschland). Bis zum Abschluss der Umstellung kann die Web-App übergangsweise
              noch über Vercel Inc. ausgeliefert werden.
            </li>
            <li>
              Landingpage (workflow-app.de): Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, USA
              (Content-Delivery-Netzwerk, siehe Abschnitte 11 und 12).
            </li>
          </Liste>
        </Abschnitt>

        <Abschnitt titel="5. Benutzerkonto">
          <p>
            Der Zugang zu WorkFlow erfolgt über ein persönliches Benutzerkonto, das durch den Administrator Ihres
            Unternehmens für Sie eingerichtet wird (keine öffentliche Selbstregistrierung). Verarbeitet werden:
          </p>
          <Liste>
            <li>Stammdaten: Name und geschäftliche E-Mail-Adresse,</li>
            <li>
              Anmeldedaten: Passwort (ausschließlich als kryptografischer Hash gespeichert, für uns nicht im Klartext
              einsehbar),
            </li>
            <li>Rollen- und Berechtigungsdaten: Benutzerrolle (z. B. Admin, Planer, Techniker, Kunde) und Zuordnung zu
              Ihrem Unternehmen,</li>
            <li>optionale Profildaten: Telefonnummer, Positionsbezeichnung und Anschrift, sofern Sie diese freiwillig
              hinterlegen.</li>
          </Liste>
          <p>
            <strong>Zweck und Rechtsgrundlage:</strong> Bereitstellung und Absicherung der Funktionen von WorkFlow sowie
            Erfüllung des Nutzungs- bzw. Vertragsverhältnisses (Art. 6 Abs. 1 lit. b DSGVO) und unser berechtigtes
            Interesse an einer geordneten Nutzerverwaltung (Art. 6 Abs. 1 lit. f DSGVO).
          </p>
        </Abschnitt>

        <Abschnitt titel="6. Im Rahmen der Projektnutzung verarbeitete Daten">
          <p>
            Zur Erfüllung des Leistungsumfangs verarbeitet WorkFlow projekt- und betriebsbezogene Daten, die dem jeweiligen
            Unternehmen (Mandanten) technisch strikt getrennt zugeordnet sind:
          </p>
          <Liste>
            <li>Projektdaten, Baustellenadressen, Aufgaben, Tickets, Zuständigkeiten und Status,</li>
            <li>Bautagebücher/Tagesberichte sowie Material- und Materialstammdaten,</li>
            <li>Zeiterfassungsdaten (Datum, Beginn, Ende, Pausen, zugeordnete Tätigkeit),</li>
            <li>hochgeladene Dateien (z. B. Baustellenfotos, Pläne, PDF-Dokumente, Protokolle),</li>
            <li>Termine,</li>
            <li>Nachrichten im Team- und Projekt-Chat.</li>
          </Liste>
          <p>
            <strong>Rechtsgrundlage:</strong> Diese Daten verarbeiten wir als Auftragsverarbeiter für das jeweilige
            Unternehmen (Art. 28 DSGVO, siehe Abschnitt 2). Grundlage im Verhältnis zwischen uns und dem Unternehmen ist der
            Vertrag (Art. 6 Abs. 1 lit. b DSGVO).
          </p>
        </Abschnitt>

        <Abschnitt titel="7. Berechtigungen der mobilen App">
          <p>Die Android-App greift nur in folgenden Fällen auf Funktionen Ihres Geräts zu:</p>
          <Liste>
            <li>
              <strong>Mitteilungen:</strong> Zur Zustellung von Push-Benachrichtigungen über neue Nachrichten im
              Team-Chat. Die Berechtigung wird vom Betriebssystem bei Ihnen abgefragt.
            </li>
            <li>
              <strong>Fotos, Kamera und Dateien:</strong> Wenn Sie ein Foto oder Dokument hochladen, öffnet die App die
              Dateiauswahl bzw. Kamera-App Ihres Betriebssystems. Übertragen wird nur die von Ihnen ausgewählte oder
              aufgenommene Datei; einen dauerhaften Zugriff auf Ihre Mediathek erhält die App nicht.
            </li>
          </Liste>
          <p>
            <strong>Rechtsgrundlage:</strong> Erfüllung des Nutzungsverhältnisses (Art. 6 Abs. 1 lit. b DSGVO) bzw. Ihre
            Bestätigung im Betriebssystem (Art. 6 Abs. 1 lit. a DSGVO). Berechtigungen können Sie jederzeit in den
            Einstellungen Ihres Geräts widerrufen.
          </p>
        </Abschnitt>

        <Abschnitt titel="8. Zwei-Faktor-Authentifizierung (2FA/TOTP)">
          <p>
            Sie können Ihr Konto optional mit einem zeitbasierten Einmalcode (TOTP) aus einer gängigen Authenticator-App
            absichern. Dabei wird ein geheimer Schlüssel für Ihr Konto erzeugt und beim Anmeldedienst unseres
            Dienstleisters Supabase (siehe Abschnitt 11) gespeichert.
          </p>
          <p>
            <strong>Rechtsgrundlage:</strong> Die Aktivierung erfolgt freiwillig zur Erhöhung Ihrer Kontosicherheit
            (Art. 6 Abs. 1 lit. a DSGVO). Sie können die Funktion jederzeit unter Einstellungen → Sicherheit wieder
            deaktivieren.
          </p>
        </Abschnitt>

        <Abschnitt titel="9. Geräte- und Sitzungsverwaltung">
          <p>
            Für die Übersicht „Einstellungen → Sicherheit → Angemeldete Geräte“ speichern wir je genutztem Gerät eine
            zufällig erzeugte Gerätekennung (im lokalen Speicher Ihres Browsers bzw. der App) sowie serverseitig eine
            grobe Gerätebezeichnung (z. B. „Chrome auf Windows“), den Zeitpunkt des letzten Zugriffs und eine Kennung der
            zugehörigen Anmeldesitzung. Einträge zu nicht mehr gültigen Anmeldungen werden automatisch gelöscht, beim
            Abmelden wird der Eintrag des Geräts entfernt.
          </p>
          <p>
            <strong>Rechtsgrundlage:</strong> unser berechtigtes Interesse an der Kontosicherheit und am Schutz vor
            unbefugten Zugriffen (Art. 6 Abs. 1 lit. f DSGVO).
          </p>
        </Abschnitt>

        <Abschnitt titel="10. Lokaler Speicher und keine Tracking-Cookies">
          <p>
            WorkFlow setzt <strong>keine Marketing-, Werbe- oder Tracking-Tools</strong> (z. B. Google Analytics, Facebook
            Pixel) ein. Für technische Grundfunktionen nutzen wir den lokalen Speicher Ihres Endgeräts (localStorage):
          </p>
          <Liste>
            <li>Anmeldesitzung (Sitzungstoken zur Aufrechterhaltung des Logins),</li>
            <li>Darstellungseinstellungen (helles/dunkles Farbschema),</li>
            <li>die Gerätekennung gemäß Abschnitt 9,</li>
            <li>die zuletzt angezeigte Programmversion, damit „Was ist neu“-Hinweise nur einmal erscheinen.</li>
          </Liste>
          <p>
            <strong>Rechtsgrundlage:</strong> Die Speicherung dieser unbedingt erforderlichen Informationen erfolgt auf
            Grundlage von § 25 Abs. 2 Nr. 2 TDDDG (Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz). Eine Einwilligung
            über ein Cookie-Banner ist dafür nicht erforderlich.
          </p>
        </Abschnitt>

        <Abschnitt titel="11. Empfänger und Auftragsverarbeiter">
          <p>
            Zur Erbringung unserer Dienste setzen wir folgende Dienstleister ein, mit denen, soweit erforderlich,
            Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO bestehen bzw. abgeschlossen werden:
          </p>
          <Liste>
            <li>
              <strong>Supabase, Inc.</strong> (970 Toa Payoh North #07-04, Singapur): Datenbank, Benutzeranmeldung und
              Dateispeicher (Dokumente, Fotos, Pläne, Berichte) sowie Bereitstellung der App-Updates. Die Daten werden in
              Rechenzentren von Amazon Web Services (AWS) in <strong>Frankfurt am Main, Deutschland</strong>, gespeichert.
              Supabase ist damit der zentrale Dienstleister für nahezu alle in dieser Erklärung genannten Daten.
            </li>
            <li>
              <strong>STRATO AG</strong> (Pascalstraße 10, 10587 Berlin, Deutschland): Serverbetrieb und Bereitstellung
              der Web-App (app.workflow-app.de).
            </li>
            <li>
              <strong>Vercel Inc.</strong> (340 S Lemon Ave #4133, Walnut, CA 91789, USA): Hosting der Landingpage
              (workflow-app.de) und übergangsweise der Web-App (siehe Abschnitt 4).
            </li>
            <li>
              <strong>Google LLC / Google Ireland Limited</strong> (Firebase Cloud Messaging): ausschließlich bei
              aktivierten Push-Benachrichtigungen in der Android-App. Übermittelt werden ein gerätebezogenes Push-Token
              sowie der Inhalt der Benachrichtigung, um diese auf Ihr Gerät zuzustellen (Art. 6 Abs. 1 lit. b DSGVO).
            </li>
          </Liste>
          <p>
            Programm-Updates der mobilen App werden aus unserem eigenen Speicher bei Supabase geladen; dafür wird kein
            weiterer externer Update-Dienst eingesetzt. Eine Weitergabe an sonstige Dritte, insbesondere zu Werbezwecken,
            findet nicht statt.
          </p>
        </Abschnitt>

        <Abschnitt titel="12. Datenübermittlung in Drittländer">
          <p>
            Soweit Daten in Länder außerhalb der Europäischen Union bzw. des Europäischen Wirtschaftsraums übermittelt
            werden (insbesondere in die USA) oder Dienstleister dort ihren Sitz haben, stellen wir ein angemessenes
            Datenschutzniveau sicher durch:
          </p>
          <Liste>
            <li>
              den Angemessenheitsbeschluss der EU-Kommission zum <strong>EU-U.S. Data Privacy Framework (DPF)</strong>,
              soweit der jeweilige US-Dienstleister danach zertifiziert ist (z. B. Google LLC, Vercel Inc.), bzw.
            </li>
            <li>
              die von der EU-Kommission genehmigten <strong>Standardvertragsklauseln</strong> gemäß Art. 46 Abs. 2 lit. c
              DSGVO, soweit ein Dienstleister nicht unter das DPF fällt oder in einem anderen Drittstaat ansässig ist (wie
              Supabase, Inc. in Singapur; die Datenspeicherung erfolgt dabei in Frankfurt am Main).
            </li>
          </Liste>
        </Abschnitt>

        <Abschnitt titel="13. Speicherdauer und Löschung">
          <p>
            Wir speichern personenbezogene Daten nur so lange, wie es für den jeweiligen Zweck erforderlich ist oder
            gesetzliche Aufbewahrungspflichten es vorschreiben (z. B. nach HGB oder AO: 6 bis 10 Jahre für steuerlich
            relevante Unterlagen).
          </p>
          <p>
            Bei Löschung eines Benutzerkontos oder Beendigung des Vertrags mit dem Unternehmen werden die betroffenen Daten
            gelöscht oder anonymisiert, sofern das Unternehmen nicht zur weiteren Aufbewahrung verpflichtet ist oder noch
            offene Ansprüche bestehen.
          </p>
        </Abschnitt>

        <Abschnitt titel="14. Datensicherheit">
          <p>
            Alle Datenübertragungen zwischen Ihren Geräten und unseren Servern erfolgen verschlüsselt per TLS. Der Zugriff
            auf Daten in der Datenbank ist durch Zugriffsregeln auf Zeilenebene (Row-Level Security) pro Unternehmen
            strikt getrennt, sodass kein Unternehmen Einblick in die Daten eines anderen Unternehmens erhält. Passwörter
            werden ausschließlich als gesalzener Hash mit einem modernen Verfahren gespeichert. Zusätzlich steht eine
            optionale Zwei-Faktor-Authentifizierung zur Verfügung.
          </p>
        </Abschnitt>

        <Abschnitt titel="15. Aktualität und Änderungen dieser Erklärung">
          <p>
            Durch die Weiterentwicklung von WorkFlow oder geänderte gesetzliche Vorgaben kann eine Anpassung dieser
            Datenschutzerklärung erforderlich werden. Die jeweils aktuelle Fassung ist jederzeit in der App und auf der
            Webseite abrufbar.
          </p>
        </Abschnitt>
      </div>
    </div>
  )
}
