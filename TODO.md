# TODO

Regeln für Claude:
- Jeden Punkt eigenständig abarbeiten, ohne Rückfrage, sobald er hier steht.
- Nach Erledigung: Punkt aus der Datei entfernen (kein Archiv) — nur offene Punkte werden hier gelistet.
- Wenn ein Punkt unklar ist und wirklich nicht ohne Rückfrage lösbar ist: als `[?]` markieren mit kurzer Frage, weitermachen mit dem nächsten Punkt statt zu blockieren.
- Diese Datei ist die einzige Quelle der Wahrheit für offene Aufgaben (übersteht Abstürze).
- Jeden Befehl/Auftrag des Nutzers aus dem Chat eigenständig analysieren und als eigenen Punkt hier einpflegen, sobald er noch nicht abgeschlossen ist.

## Offen

- [ ] E-Mail-Benachrichtigungssystem (2026-10-01, PlanRadar-Vergleich Profil-Einstellungen): echter Mail-Versand für Ticket-Ereignisse (neues Ticket, Statusänderung, Erledigungsdatum-Erinnerung) und Dokument-Ereignisse (neue Dokumente, Freigabe-Status) inkl. Nutzer-Einstellungen dazu (Häufigkeit: sofort/gesammelt, welche Tickets, eigene Änderungen ausblenden etc.) — fehlt komplett, aktuell keine Mail-Versand-Infrastruktur im Projekt. Braucht: E-Mail-Provider-Anbindung (z. B. Supabase Edge Function + Resend/SendGrid), Trigger-Logik je Ereignis, Präferenz-Speicherung pro Nutzer, UI dazu in Einstellungen → Profil & persönliche Einstellungen. **Nicht eigenständig starten** — Nutzer hat das ausdrücklich auf später verschoben, erst nach explizitem Hinweis umsetzen.
