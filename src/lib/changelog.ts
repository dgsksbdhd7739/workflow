// Aenderungsprotokoll je Version. Bei jedem Release einen neuen Eintrag oben
// ergaenzen (Versionsnummer muss zu package.json passen). Wird beim Start
// mit der zuletzt gesehenen Version verglichen (siehe ChangelogDialog), um
// "Was ist neu"-Hinweise nach einem Update anzuzeigen.

export interface ChangelogEintrag {
  version: string
  datum: string
  aenderungen: string[]
}

export const CHANGELOG: ChangelogEintrag[] = [
  {
    version: '1.8.2',
    datum: '2026-10-01',
    aenderungen: [
      'Neu: Android-App direkt von der Web-App herunterladen — Link "Android-App" auf der Anmeldeseite (unter /download/).',
    ],
  },
  {
    version: '1.8.1',
    datum: '2026-10-01',
    aenderungen: [
      'Plattform-Verwaltung: bestehende Firmen lassen sich jetzt bearbeiten — Nutzerlimit ändern sowie Firmendaten (Adresse, Kontakt, Logo) pflegen.',
      'Sicherheit: Das Nutzerlimit einer Firma kann nur noch vom WorkFlow-Betreiber geändert werden, nicht mehr vom Firmen-Admin selbst.',
    ],
  },
  {
    version: '1.8.0',
    datum: '2026-10-01',
    aenderungen: [
      'Neu: Plattform-Verwaltung (nur für den WorkFlow-Betreiber sichtbar) — neue Firmen direkt in der App anlegen, inklusive Nutzerlimit je Firma. Jede Firma bleibt dabei vollständig von den anderen getrennt.',
    ],
  },
  {
    version: '1.7.7',
    datum: '2026-10-01',
    aenderungen: [
      'Neu: Impressum unter /impressum, verlinkt von der Anmeldeseite, der Landingpage und gegenseitig mit der Datenschutzerklärung.',
    ],
  },
  {
    version: '1.7.6',
    datum: '2026-10-01',
    aenderungen: [
      'Neu: Datenschutzerklärung unter /datenschutz, verlinkt von der Anmeldeseite und der Landingpage.',
    ],
  },
  {
    version: '1.7.5',
    datum: '2026-10-01',
    aenderungen: [
      'Dashboard: Abstand zwischen "Heutiges Tagesbericht erstellt?" und dem Ja/Nein-Hinweis verkleinert.',
    ],
  },
  {
    version: '1.7.4',
    datum: '2026-10-01',
    aenderungen: [
      'Dashboard: jede Projekt-Karte zeigt jetzt "Heutiges Tagesbericht erstellt?" mit grünem/rotem Hinweis, je nachdem ob für das Projekt heute schon ein Tagesbericht angelegt wurde.',
    ],
  },
  {
    version: '1.7.3',
    datum: '2026-10-01',
    aenderungen: [
      'Einstellungen: Reiter-Leiste oben auf der Seite entfernt — die Auswahl des Bereichs erfolgt jetzt nur noch über den Strukturbaum in der Seitenleiste.',
    ],
  },
  {
    version: '1.7.2',
    datum: '2026-10-01',
    aenderungen: [
      'Einstellungen zeigt jetzt immer nur einen Bereich gleichzeitig (Start: Konto) statt aller Bereiche untereinander — Auswahl über die Reiter oben auf der Seite oder den Strukturbaum in der Seitenleiste.',
    ],
  },
  {
    version: '1.7.1',
    datum: '2026-10-01',
    aenderungen: [
      'Seitenleiste zeigt jetzt einen vollständigen Struktur-Baum: Einstellungen klappt alle Unterbereiche auf (Konto, Profil, Sicherheit, Datenschutz, Darstellung, Verwaltung mit Nutzer/Statusvorlagen/Materialstamm/Ticket-Formularen/Tagesbericht-Vorlagen, Unternehmen), und ein Projekt zeigt alle seine Bereiche, sobald man sich darin befindet — der aktuelle Punkt ist dabei immer farblich hervorgehoben.',
    ],
  },
  {
    version: '1.7.0',
    datum: '2026-10-01',
    aenderungen: [
      'Neu: Einstellungen → Sicherheit — Zwei-Faktor-Authentifizierung per Authenticator-App aktivierbar, dazu eine Liste der zuletzt angemeldeten Geräte mit der Möglichkeit, sich von allen anderen Geräten gleichzeitig abzumelden.',
      'Neu: Einstellungen → Datenschutz & Hinweise — Schalter, ob "Was ist neu"-Hinweise nach Updates automatisch angezeigt werden.',
    ],
  },
  {
    version: '1.6.9',
    datum: '2026-10-01',
    aenderungen: [
      'Einstellungen: neuer Bereich "Profil & persönliche Einstellungen" — Telefon, Position, Adresse hinterlegen und die eigene E-Mail-Adresse per Bestätigungslink ändern.',
    ],
  },
  {
    version: '1.6.8',
    datum: '2026-10-01',
    aenderungen: [
      'Dokumente: Projektdokumente können jetzt in Ordnern organisiert werden (beliebig verschachtelbar), und jedes Dokument zeigt seine Dateigröße an.',
    ],
  },
  {
    version: '1.6.7',
    datum: '2026-10-01',
    aenderungen: [
      'Dashboard: jedes Projekt zeigt jetzt eine Status-Karte mit Projektnummer/-zeitraum, Aufgaben-Verteilung (Stopp/In Arbeit/Abgeschlossen), offenen und überfälligen Tickets sowie einem Fortschritts-Ring.',
    ],
  },
  {
    version: '1.6.6',
    datum: '2026-09-28',
    aenderungen: [
      'Neu: Tagesbericht-Vorlagen — in den Einstellungen kann optional eine eigene PDF-Vorlage mit ausfüllbaren Formularfeldern hochgeladen werden. Ist eine Vorlage als Standard gesetzt, wird sie beim Öffnen eines Tagesberichts automatisch befüllt statt des bisherigen Standard-Layouts.',
    ],
  },
  {
    version: '1.6.5',
    datum: '2026-09-28',
    aenderungen: [
      'Neu: Ticket-Formulare — Admin/Planer können in den Einstellungen eigene Zusatzfelder je Formular anlegen (Text, Zahl, Datum, Ja/Nein, Auswahl, optional Pflichtfeld). Beim Erstellen eines Tickets ist das passende Formular wählbar, die Zusatzfelder erscheinen direkt im Formular und werden am Ticket angezeigt.',
    ],
  },
  {
    version: '1.6.4',
    datum: '2026-09-28',
    aenderungen: [
      'Dokumente: Freigabe-Workflow (anfordern, freigeben/ablehnen durch Admin/Planer) sowie "Neue Version hochladen" — ältere Versionen bleiben erhalten und sind über die jeweils neueste Version einsehbar.',
    ],
  },
  {
    version: '1.6.3',
    datum: '2026-09-28',
    aenderungen: [
      'Nutzerverwaltung: Admin/Planer können einzelnen Nutzern den Zugriff auf Material, Dokumente, Tagesberichte oder Termine gezielt entziehen — unabhängig von deren Rolle.',
    ],
  },
  {
    version: '1.6.2',
    datum: '2026-09-28',
    aenderungen: [
      'Aufgaben: aktuelle Status-/Suchfilter können jetzt unter einem eigenen Namen gespeichert und später per Dropdown wieder angewendet werden.',
    ],
  },
  {
    version: '1.6.1',
    datum: '2026-09-28',
    aenderungen: [
      'Tickets: zusätzliche Empfänger (cc) können ergänzt werden, die das Ticket dann ebenfalls einsehen können — auch wenn sie sonst keinen Zugriff auf das Projekt haben.',
    ],
  },
  {
    version: '1.6.0',
    datum: '2026-09-28',
    aenderungen: [
      'Tickets: neue Felder "Erledigen bis" und "Nachfrist" beim Erstellen, sowie eine Sperren/Entsperren-Funktion für Admin/Planer, die ein Ticket gegen weitere Änderungen fixiert.',
    ],
  },
  {
    version: '1.5.10',
    datum: '2026-09-14',
    aenderungen: [
      'Pläne: Öffnet wieder im gleichen Tab statt in einem neuen Browser-Tab.',
    ],
  },
  {
    version: '1.5.9',
    datum: '2026-09-14',
    aenderungen: [
      'Pläne: Fehler behoben, durch den der rechte/untere Planrand beim Reinzoomen nicht mehr erreichbar war — die Verschieben-Grenzen wurden falsch berechnet, sobald das Seitenverhältnis von Plan und Fenster nicht exakt übereinstimmte.',
    ],
  },
  {
    version: '1.5.8',
    datum: '2026-09-14',
    aenderungen: [
      'Pläne: Die +/− Zoom-Knöpfe zoomen jetzt auf die Stelle, über der die Maus zuletzt stand, statt immer auf die Fenstermitte — jede beliebige Stelle im Plan lässt sich so gezielt anvisieren.',
    ],
  },
  {
    version: '1.5.7',
    datum: '2026-09-14',
    aenderungen: [
      'Pläne: Neuer Navigations-Modus (Standard) — Klicks bewegen/zoomen nur bzw. öffnen vorhandene Markierungen, ohne versehentlich eine neue Markierung anzulegen. Punkt- und Rechteck-Werkzeug müssen jetzt bewusst in der Werkzeugleiste ausgewählt werden, um neue Markierungen zu setzen.',
      'Pläne: Zoomen per Mausrad/Trackpad und über die +/− Knöpfe ist jetzt schneller und läuft weich statt abgehackt.',
    ],
  },
  {
    version: '1.5.6',
    datum: '2026-09-14',
    aenderungen: [
      'Pläne: Verschieben per Trackpad/Mausrad behoben — zweifingriges Scrollen bewegt jetzt den Plan, Strg+Scrollen (oder eine Pinch-Geste) zoomt. Vorher wurde jede Scrollbewegung als Zoom interpretiert, Verschieben war nur per Klicken-und-Ziehen möglich.',
    ],
  },
  {
    version: '1.5.5',
    datum: '2026-09-14',
    aenderungen: [
      'Pläne: Ein Plan öffnet sich jetzt in einem neuen Browser-Tab und passt sich automatisch an die Fenster-/Monitorgröße an, sodass die komplette Seite ohne Scrollen sichtbar ist.',
    ],
  },
  {
    version: '1.5.4',
    datum: '2026-09-14',
    aenderungen: [
      'Bautagebuch-PDF: Markenfarbe von Blau auf das Logo-Violett umgestellt (Balken oben, Stand-Text, Fortschrittsbalken, Häkchen).',
    ],
  },
  {
    version: '1.5.3',
    datum: '2026-09-14',
    aenderungen: [
      'Bautagebuch-PDF: Fortschrittsanzeige sitzt jetzt direkt unter Stand/Prozentanzeige statt in einer eigenen Spalte — dadurch ist die Kommentarspalte deutlich breiter, Text und Fotos werden größer dargestellt.',
    ],
  },
  {
    version: '1.5.2',
    datum: '2026-09-14',
    aenderungen: [
      'Bautagebuch-PDF: die separate "Tür/Aufgabe – Stand"-Tabelle je Tag entfällt, der Stand steht jetzt direkt bei der jeweiligen Aufgabe im Bericht. Dadurch erscheinen jetzt auch Türen ohne Zeiterfassung/Kommentar an dem Tag im PDF.',
    ],
  },
  {
    version: '1.5.1',
    datum: '2026-09-11',
    aenderungen: [
      'Tickets: Techniker können ein offenes Ticket jetzt selbst abschließen — dafür müssen sie einen Kommentar und mindestens ein Foto als Nachweis der Behebung anhängen (mehrere Fotos möglich). Admin und Planer können ein Ticket weiterhin ohne diesen Nachweis abschließen oder wieder öffnen.',
      'Fehler behoben: Die Planansicht (PDF-Anzeige) lud auf der Web-Version nicht, weil der Server eine benötigte Datei mit falschem Dateityp auslieferte.',
    ],
  },
  {
    version: '1.5.0',
    datum: '2026-09-07',
    aenderungen: [
      'Neu: Tickets an Aufgaben — Kunde, Admin und Planer können einen Mangel/ein Problem direkt an der betroffenen Aufgabe melden (z. B. bei einer Vor-Ort-Abnahme). Admin und Planer sehen offene Tickets zusätzlich gesammelt im Dashboard und können sie als erledigt markieren.',
      'Materialstamm: Hersteller und Artikelnummer können jetzt je Material hinterlegt werden.',
    ],
  },
  {
    version: '1.4.4',
    datum: '2026-08-21',
    aenderungen: [
      'Neue Punkt-Markierung auf Plänen: 1. Klick öffnet den Kasten, ein gestrichelter Pfeil vom Ausgangspunkt zeigt beim Bewegen der Maus die freie Positionierung, 2. Klick platziert ihn fest — erst danach öffnet sich das Formular. Präziser als ein einzelner Klick, vor allem am Handy.',
      'Wurde der Kasten dabei versetzt zur eigentlichen Stelle platziert, bleiben Punkt und Kasten dauerhaft durch eine gestrichelte Linie verbunden — auch nach dem Speichern, damit auf dem Plan jederzeit nachvollziehbar bleibt, wohin die Aufgabe gehört.',
    ],
  },
  {
    version: '1.4.3',
    datum: '2026-08-21',
    aenderungen: [
      'Fehler behoben, durch den das Anlegen neuer Projekte fehlschlagen konnte ("Could not find the table \'public.baustellen\'")',
      'Planansicht: Plan öffnet jetzt bildschirmfüllend mit schwebender Werkzeugleiste über dem Plan, statt eingebettet in der normalen Seite',
    ],
  },
  {
    version: '1.4.1',
    datum: '2026-08-19',
    aenderungen: [
      'Bautagebuch: Aufgaben-Block im PDF neu aufgebaut — links Titel/Zeit/Fortschritt in Prozent, mittig alle Fortschrittfelder des Projekts mit Haken beim aktuellen Stand, rechts Kommentar mit Fotos',
    ],
  },
  {
    version: '1.4.0',
    datum: '2026-08-19',
    aenderungen: [
      'Neue Einführungs-Anleitung, die neuen Nutzern nach dem ersten Passwort-Wechsel automatisch die wichtigsten Bereiche zeigt — jederzeit über die Einstellungen erneut aufrufbar',
      'Neue Hilfe-Seite mit Kurzerklärungen zu allen Funktionsbereichen, erreichbar über die Navigation',
    ],
  },
  {
    version: '1.2.0',
    datum: '2026-08-19',
    aenderungen: [
      'Bautagebuch: jeder Bericht listet jetzt alle Türen/Aufgaben mit ihrem Stand zum Zeitpunkt der Erstellung',
      'Unternehmensdaten und Firmenlogo in den Einstellungen pflegbar — erscheinen im Kopf jedes PDF-Exports',
      'PDF-Exporte komplett überarbeitet: farbige Status-Badges, Material als Chips, Kommentare als Zitatblock, Fußzeile mit Seitenzahl',
      'Materialstamm: feste, unternehmensweite Materialien anlegen und Aufgaben zuordnen, statt jedes Mal Freitext',
      'Neuer Projekt-Chat zusätzlich zum Team-Chat, mit Auswahl des Projekts',
      'Fotos werden vor dem Hochladen automatisch komprimiert, ohne sichtbaren Qualitätsverlust',
      'Logo oben links führt jetzt auch am Desktop wieder zurück zu Home',
    ],
  },
  {
    version: '1.1.2',
    datum: '2026-08-17',
    aenderungen: [
      'Updates werden jetzt vor dem Start geladen — kein manuelles Schließen und Neuöffnen der App mehr nötig',
    ],
  },
  {
    version: '1.1.1',
    datum: '2026-08-17',
    aenderungen: [
      'Untere Navigation in Projekten überarbeitet: nur noch Übersicht, Aufgaben, Pläne und Zeiterfassung — gleichmäßig verteilt, kein Zusammenquetschen mehr',
      'Weitere Bereiche (Dokumente, Tagesberichte, Material, Termine) direkt über die Kacheln in der Projekt-Übersicht erreichbar',
    ],
  },
  {
    version: '1.1.0',
    datum: '2026-08-17',
    aenderungen: [
      'Push-Benachrichtigungen für neue Team-Chat-Nachrichten',
      'Neue Navigation: Home, Team-Chat, Archiv und Einstellungen direkt erreichbar',
      'Passwort ändern und Abmelden sind jetzt in den Einstellungen',
      'Diese "Was ist neu"-Anzeige nach Updates',
    ],
  },
]

const STORAGE_KEY = 'workflow_last_seen_version'

function vergleicheVersionen(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function holeUngeseheneEintraege(aktuelleVersion: string): ChangelogEintrag[] {
  let letzteGesehene: string | null = null
  try {
    letzteGesehene = localStorage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  // Erster Start ueberhaupt: nichts anzeigen, nur Marke setzen.
  if (!letzteGesehene) {
    markiereAlsGesehen(aktuelleVersion)
    return []
  }
  if (vergleicheVersionen(aktuelleVersion, letzteGesehene) <= 0) return []
  return CHANGELOG.filter(
    (e) => vergleicheVersionen(e.version, letzteGesehene!) > 0 && vergleicheVersionen(e.version, aktuelleVersion) <= 0,
  )
}

export function markiereAlsGesehen(version: string) {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // localStorage nicht verfuegbar (z. B. privater Modus) -> Hinweis wird
    // beim naechsten Start erneut gezeigt, kein kritischer Fehler.
  }
}
