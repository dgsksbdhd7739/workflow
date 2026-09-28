# TODO

Regeln für Claude:
- Jeden Punkt eigenständig abarbeiten, ohne Rückfrage, sobald er hier steht.
- Nach Erledigung: Punkt aus der Datei entfernen (kein Archiv) — nur offene Punkte werden hier gelistet.
- Wenn ein Punkt unklar ist und wirklich nicht ohne Rückfrage lösbar ist: als `[?]` markieren mit kurzer Frage, weitermachen mit dem nächsten Punkt statt zu blockieren.
- Diese Datei ist die einzige Quelle der Wahrheit für offene Aufgaben (übersteht Abstürze).
- Jeden Befehl/Auftrag des Nutzers aus dem Chat eigenständig analysieren und als eigenen Punkt hier einpflegen, sobald er noch nicht abgeschlossen ist.

## Offen

- [ ] PlanRadar-Vergleich (2026-09-28, Zugang von Nutzer bereitgestellt, Account mit eingeschränkter Lizenz — nur Dashboard/Tickets/Projektberichte/Dokumente/Freigaben zugänglich, Rest lizenzgesperrt): folgende PlanRadar-Funktionen fehlen uns bzw. sind dort ausgereifter, zur Priorisierung/Umsetzung:
  - Konfigurierbare Formular-Vorlagen für Tickets: PlanRadar erlaubt mehrere Ticket-Formulartypen pro Projekt (Dropdown "Formular: Alle Formulare", filterbar). Wir haben nur ein festes Aufgabe/Ticket-Formular.
  - Konfigurierbare Vorlagen für Tagesberichte: PlanRadar zeigt mehrere Berichtsvorlagen zur Auswahl (u.a. "Bautagesbericht" sowie eine hochgeladene eigene PDF-Vorlage "TEST 2.pdf") statt eines fixen Formats. Unser Bautagebuch-PDF hat nur ein festes Layout ohne Vorlagenwahl.
  - Dokumentenverwaltung mit Freigabe-Workflow: eigener Bereich "Freigabeanforderungen", pro Dokument ein "Freigabestatus", Spalte "Zuletzt geänderte Markups" (Versionierung von Markierungen auf Dokumenten). Unsere Dokumente-Seite ist eine einfache Liste ohne Freigabeprozess oder Markup-Versionierung.
  - Ticket-Zusatzfelder: "Nachfrist" (Kulanzfrist nach Fälligkeitsdatum, bevor eskaliert wird) und "Ist gesperrt" (Ticket fixierbar/sperrbar gegen Änderungen) — beides existiert bei uns nicht.
  - Mehrere Empfänger (cc) pro Ticket: PlanRadar hat neben dem Zuständigen ein "Empfänger (cc)"-Feld für zusätzliche Benachrichtigungsempfänger. Wir kennen nur einen Zuständigen.
  - Gespeicherte, benannte Filter für Ticketlisten: PlanRadar erlaubt es, Filterkombinationen zu speichern ("Gespeicherte Filter"). Unsere Aufgaben-Liste hat nur feste Status-Tabs (Alle/Stopp/In Arbeit/Abgeschlossen).
  - Granulare Modul-Zugriffssteuerung pro Nutzer: PlanRadar kann einzelne App-Bereiche für einzelne Nutzer sperren, unabhängig von der Grundrolle (zeigt dann "Sie haben keinen Zugang zu diesem Bereich"). Bei uns sind Rechte nur an die 4 festen Rollen gekoppelt — eher ein "nice to have", nicht zwingend nötig für unsere Nutzergröße.
  - Nicht geprüft (lizenzbedingt gesperrt, für tieferen Vergleich müsste der Account höher gestuft werden): Plan-/BIM-Ansicht, Formular-Baukasten, Zeiterfassung, Aufgabenverwaltung getrennt von Tickets, Chat/Kommunikation — laut Sidebar-Icons vorhanden, aber Inhalt nicht einsehbar gewesen.
