# CLAUDE.md

Diese Datei gibt Claude Code Hinweise für die Arbeit in diesem Repository. Sie bleibt bewusst kurz — Details stehen in den verlinkten Dokumenten und werden hier nicht dupliziert.

## Projektübersicht

WorkFlow — Projekt-Management-App für Bau-/Handwerksbetriebe: Aufgabenmanagement, Pläne mit Markierungen, Bautagebuch/Tagesberichte, Zeiterfassung, Team-/Projekt-Chat. Multi-Tenant SaaS (mehrere Firmen auf derselben Instanz, strikt datengetrennt über Row Level Security).

## Tech-Stack

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, React Router.
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime) — Migrationen unter `supabase/migrations/`, fortlaufend nummeriert.
- **Android:** Capacitor (`android/`), Live-Updates über Capgo (`src/lib/liveUpdate.ts`).
- **Windows:** Tauri (`src-tauri/`).

## Architektur (verbindlich für neue Dateien)

- Deutsche Bezeichner im Code durchgängig (Variablen, Funktionen, DB-Tabellen/-Spalten, RLS-Policy-Namen) — Konvention im gesamten Projekt, nicht mischen.
- Seiten unter `src/pages`, wiederverwendbare Komponenten unter `src/components`, Domain-/Hilfslogik unter `src/lib`.
- DB-Terminologie folgt der UI: `projekte`/`projekt_id`, `aufgaben`/`aufgabe_id` (siehe Migration `0035_projekt_aufgabe_umbenennung.sql`).
- Neue Tabelle mit Unternehmens- oder Projektbezug braucht immer eine passende RLS-Policy (`unternehmen_id = current_unternehmen_id()` bzw. `projekt_im_eigenen_unternehmen(...)`, siehe `0033_mandantentrennung.sql` als Referenz) — sonst Datenleck zwischen Firmen.
- Tabellen-/Spaltenumbenennungen sind reine Metadaten-Operationen (`ALTER TABLE ... RENAME`) und aktualisieren FKs/Indizes/RLS-Policies automatisch; Funktionskörper (SQL/PLpgSQL) referenzieren Namen dagegen als Text und müssen bei einer Umbenennung manuell nachgezogen werden.

## Verbindliche Regeln

- **Diese Datei und [Agents.md](Agents.md) gelten in jedem Chat als aktive Arbeitsgrundlage** — vor Umsetzung lesen.
- **Sprache:** Antworten auf Deutsch, kurz und in Stichpunkten wo sinnvoll.
- **Nach jeder Versionsänderung:** Commit + Git-Tag (`vX.Y.Z` passend zum `versionName`) selbstständig erledigen. **Push zu einem Remote wird vorher kurz angekündigt, nicht stillschweigend ausgeführt** — Ausnahme: der dokumentierte `/update`-Deploy-Workflow (siehe Agents.md), der bereits vorab autorisiert ist.
- **UI-Standard:** Vorhandene Utility-Klassen aus `src/index.css` wiederverwenden statt neue Stile zu erfinden — `.page`, `.card`, `.btn-primary`/`.btn-secondary`/`.btn-ghost`, `.field-label`/`.field-input`, `.banner-error`.
- **APK-Name:** Jede generierte Release-APK heißt `WorkFlow-v{versionName}.apk` (siehe `landing/index.html`, Download-Link).
- **Doku-Pflicht pro Arbeitspaket** (siehe Agents.md für den vollen Ablauf): betroffene READMEs/docs und bei nutzersichtbaren Änderungen der in-App-Changelog (`src/lib/changelog.ts`) im selben Arbeitspaket aktualisieren — keine Abschlussmeldung ohne synchronen Stand.
- **Backup-Integrität:** Vor jedem finalen Projekt-Backup Kompilierbarkeit (`npm run build`) und saubere Imports/Paketstrukturen prüfen.
- **Vier getrennte Deploy-Pfade, alle manuell** (kein CI/CD) — siehe Agents.md/Deploy-Pipeline-Notizen: Web-Live-Update, Android-APK-Rebuild, Root-SPA-Vercel-Projekt, Landing-Vercel-Projekt (zwei separate Vercel-Projekte — beide deployen, sonst liefert die APK-Download-Seite eine veraltete Datei aus).

## Bekannter Sonderfall: Login/Backend

- Multi-Tenant-Provisionierung: `handle_new_user()` hängt neue Accounts an das Unternehmen aus `raw_user_meta_data.unternehmen_id` (gesetzt von der `create-user`-Edge-Function); ohne diese Angabe fällt es auf das älteste Unternehmen zurück.
- `projekte` (früher `baustellen`) braucht eine eigene, nicht über `kunde_hat_zugriff()` verschachtelte Lese-Policy: Der Supabase-Client hängt nach jedem Insert `select().single()` an, wodurch Postgres zusätzlich zur Insert- auch die Select-Policy für die *gerade eingefügte* Zeile prüft — eine Unterabfrage zurück in dieselbe Tabelle sieht diese Zeile innerhalb desselben Kommandos noch nicht (siehe `0034_baustellen_lesen_ohne_selbstreferenz.sql`, war ein echter Produktions-Bug).
- Gelegentlich einmaliger `PGRST303 "JWT issued at future"`-Fehler direkt nach Login beobachtet (nicht reproduzierbar, keine Folgefehler) — vermutlich ein Timing-Artefakt beim ersten Request nach Token-Ausstellung, kein Schema-/Code-Problem.

## Skill

Kein projektspezifischer Claude-Code-Skill definiert. Zum Starten/Testen der App den eingebauten `run`-Skill nutzen (`npm run dev` + Browser-Verifikation, siehe letzte Session für ein Playwright-Beispiel).

## Weitere Dokumente

- [Agents.md](Agents.md) — ausführlicher Status, Architektur-Vorgaben, verbindlicher Agent-Arbeitsmodus (Pflichtablauf pro Arbeitspaket).
- [TODO.md](TODO.md) — offene To-dos, die bewusst noch nicht umgesetzt wurden.
- [README.md](README.md) — Setup, Tech-Stack, Datenmodell-Kurzüberblick.
- [docs/firma-erstellen.md](docs/firma-erstellen.md) — manuelle Firmen-Provisionierung für neue Mandanten.
- In-App-Changelog: [src/lib/changelog.ts](src/lib/changelog.ts) (nutzerorientiert, angezeigt über `ChangelogDialog`).
