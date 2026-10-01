# TODO

Regeln für Claude:
- Jeden Punkt eigenständig abarbeiten, ohne Rückfrage, sobald er hier steht.
- Nach Erledigung: Punkt aus der Datei entfernen (kein Archiv) — nur offene Punkte werden hier gelistet.
- Wenn ein Punkt unklar ist und wirklich nicht ohne Rückfrage lösbar ist: als `[?]` markieren mit kurzer Frage, weitermachen mit dem nächsten Punkt statt zu blockieren.
- Diese Datei ist die einzige Quelle der Wahrheit für offene Aufgaben (übersteht Abstürze).
- Jeden Befehl/Auftrag des Nutzers aus dem Chat eigenständig analysieren und als eigenen Punkt hier einpflegen, sobald er noch nicht abgeschlossen ist.

## Offen

- [ ] E-Mail-Benachrichtigungssystem (2026-10-01, PlanRadar-Vergleich Profil-Einstellungen): echter Mail-Versand für Ticket-Ereignisse (neues Ticket, Statusänderung, Erledigungsdatum-Erinnerung) und Dokument-Ereignisse (neue Dokumente, Freigabe-Status) inkl. Nutzer-Einstellungen dazu (Häufigkeit: sofort/gesammelt, welche Tickets, eigene Änderungen ausblenden etc.) — fehlt komplett, aktuell keine Mail-Versand-Infrastruktur im Projekt. Braucht: E-Mail-Provider-Anbindung (z. B. Supabase Edge Function + Resend/SendGrid), Trigger-Logik je Ereignis, Präferenz-Speicherung pro Nutzer, UI dazu in Einstellungen → Profil & persönliche Einstellungen. **Nicht eigenständig starten** — Nutzer hat das ausdrücklich auf später verschoben, erst nach explizitem Hinweis umsetzen.
- [ ] Datenschutzerklärung rechtlich prüfen lassen (2026-10-01): Erstentwurf ist seit v1.7.6 live unter /datenschutz (technisch korrekt anhand der eingesetzten Dienste erstellt, siehe [[project_legal_texts]]), aber noch **nicht anwaltlich geprüft**. Vor echtem Drittkunden-Einsatz über einen Fachanwalt für IT-Recht oder einen Dienst wie eRecht24/IT-Recht Kanzlei gegenprüfen lassen. **Nicht eigenständig starten** — braucht menschliche Rechtsprüfung, kein Claude-Arbeitspaket.
- [ ] Rechtliche Grundlage für zahlende Kunden (2026-10-01, Preisrecherche): AGB und Auftragsverarbeitungsvertrag (AVV nach Art. 28 DSGVO) erstellen lassen, zusammen mit der anwaltlichen Prüfung von Datenschutzerklärung/Impressum (siehe Punkt oben). **Nicht eigenständig starten** — braucht Fachanwalt, kein Claude-Arbeitspaket.
- [ ] Gewerbe & Steuer klären (2026-10-01): Gewerbeanmeldung für den SaaS-Vertrieb, Entscheidung Kleinunternehmerregelung vs. Umsatzsteuer (beeinflusst Netto-/Bruttopreise der Preisliste). **Nicht eigenständig starten** — Aufgabe des Nutzers bzw. Steuerberaters.
- [ ] Zahlungs-/Abo-System (2026-10-01): z. B. Stripe-Anbindung mit Paketen (Starter/Team/Business), 30-Tage-Testphase, Jahresrabatt, automatische Kopplung des Pakets an `unternehmen.max_nutzer`, Sperre bei Zahlungsausfall. Preisentwurf: `C:\Users\Micha\Desktop\Projekte_Mesut\WorkFlow-Preisliste-v2.xlsx` (bewusst außerhalb des öffentlichen Repos). **Nicht eigenständig starten** — vom Nutzer bewusst zurückgestellt, erst nach Rechtsgrundlage + expliziter Freigabe.
- [ ] Preisseite auf der Landingpage (2026-10-01): Pakete aus der finalen Preisliste darstellen, inkl. Testphase-Hinweis. **Erst starten, wenn der Nutzer die Preise festgelegt hat.**
- [ ] Funktionsumfang je Paket (2026-10-01): Paket pro Firma (`unternehmen.paket`), zentrale Funktions-/Limit-Matrix in `src/lib/pakete.ts`, gesperrte Funktionen mit Schloss + "ab Team-Paket" statt ausblenden, serverseitige Durchsetzung per RLS-Hilfsfunktion, Paketwahl im Plattform-Admin, Testphase = Business. Vorschlag zur Aufteilung im Chat vom 2026-10-01. **Erst starten, wenn der Nutzer die Aufteilung freigegeben hat.**
