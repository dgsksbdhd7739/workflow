# WorkFlow

Projekt-Management-App: Aufgabenmanagement, Pläne mit Markierungen, Bautagebuch/Tagesberichte und Zeiterfassung. Läuft als Web-App (Browser), Android-App (Capacitor) und Windows-Desktop-App (Tauri) aus derselben React/TypeScript-Codebasis.

## Tech-Stack

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, React Router — spricht das Backend über [src/lib/backend.ts](src/lib/backend.ts) an.
- **Backend:** eigenes Node-Backend in [server/](server/) (Fastify, Node 24 führt TypeScript direkt aus) mit PostgreSQL 17, beides auf dem eigenen STRATO-VPS in Deutschland. Anmeldung inkl. TOTP-2FA, Daten-Schnittstelle, Dateiablage, Chat-Echtzeit (WebSocket), Push (FCM) und Live-Update-Dateien — seit Version 2.0.0, vorher Supabase.
- **Android:** Capacitor (`android/`), Live-Updates über `@capgo/capacitor-updater` vom eigenen Server.
- **Windows:** Tauri (`src-tauri/`).

## Setup (Frontend)

```bash
npm install
cp .env.example .env   # VITE_API_URL = Adresse des Backends
npm run dev             # Web, http://localhost:5173
```

### Lokale Demo ohne Server

Mit `VITE_LOKALE_DEMO=true` startet WorkFlow ohne Backend und ohne Anmeldung direkt in einer lokalen Gebäude-Demo. Die Demo zeigt ausschließlich Beispieldaten; Änderungen werden im lokalen Browser-/App-Speicher abgelegt und nicht mit anderen Geräten synchronisiert. Sie ist kein Ersatz für Authentifizierung oder die echte, mandantengetrennte Projektdatenbank.

## Backend (`server/`)

```bash
cd server
npm install
npm run typecheck
npm run tunnel        # zweites Terminal: SSH-Tunnel zur Test-Datenbank workflow_test (Port 5433)
npm test              # Tests gegen workflow_test (TEST_DATABASE_URL in server/.env, siehe server/.env.example)
```

Kernidee: Die Zugriffsregeln stecken als **Row Level Security** in Postgres. Das Backend führt jede Anfrage in einer Transaktion als Rolle `authenticated` mit den Claims des angemeldeten Nutzers aus (`request.jwt.claims`, gelesen von `auth.uid()`), dadurch trennen die Policies die Firmen — nicht der Anwendungscode. Die Daten-Schnittstelle (`/api/daten/:tabelle`) gibt nur Tabellen mit aktivem RLS frei, prüft Tabellen-/Spaltennamen gegen das Schema und übergibt Werte nur als Parameter.

Weitere Endpunkte: `/api/auth/*` (Anmeldung, 2FA, Sitzungen), `/api/rpc/:name` (Freigabeliste), `/api/dateien/*` (Upload, signierte Links, Löschen — berechtigt über die Policies auf `storage.objects`), `/api/funktionen/*` (Nutzer/Firmen verwalten), `/api/live` (WebSocket für die Chats), `/api/betrieb/serverzustand` (Serverauslastung und Verlauf für die Plattform-Verwaltung; Messwerte jede Minute in `betrieb.messwerte`).

Prüfung mit echten Daten: `server/scripts/mandanten-pruefung.ts` simuliert jeden Nutzer gegen eine Kopie der Produktivdatenbank und meldet fremd sichtbare Zeilen.

## Datenbank-Migrationen

Schema liegt in [server/db/migrationen/](server/db/migrationen/) (fortlaufend nummeriert; `0000` bildet die wenigen von Policies genutzten Supabase-Objekte nach, `0001` ist das übernommene Basis-Schema). Eingespielt werden sie beim Backend-Deploy automatisch, manuell auf dem Server mit:

```bash
sudo -u postgres /opt/workflow/server/scripts/migrieren.sh workflow
```

Die frühere Supabase-Migrationshistorie (0001–0060) steht in der Git-Historie.

## Deploy

```bash
npm run deploy-server     # Backend: committeter Stand von server/, Migrationen, Neustart mit Rückfall
npm run deploy-vps        # Web-App (dist/) und Landing-Page per scp
node scripts/publish-update.mjs   # Live-Update für Android (vorher package.json-version erhöhen)
```

Server-Ersteinrichtung bzw. Neuinstallation: [scripts/vps-setup.sh](scripts/vps-setup.sh) (Nginx, Let's Encrypt, Postgres, Node, Dienst, nächtliche Sicherung).

## Plattform-Builds

```bash
npm run build            # Web-Build nach dist/
npm run android          # Capacitor: synct dist/ und öffnet Android Studio
npx tauri dev             # Windows-Desktop, Entwicklung
npx tauri build           # Windows-Desktop, Release-Installer
```

## Datenmodell (Kurzüberblick)

- `unternehmen` — Firmen (Mandanten); `profiles` — Nutzer mit Rolle und Firma
- `projekte` — Projekte (oberste Ebene je Firma)
- `aufgaben` — Aufgaben je Projekt, mit Status/Priorität/Foto/optionaler Plan-Position
- `plaene` — hochgeladene Pläne (bei mehrseitigen PDFs mit `seite`; mehrere Pläne können eine Datei teilen); Markierungen sind Aufgaben mit Plan-Position
- `gebaeude` → `geschosse` → `einheiten` — Gebäude je Projekt mit Etagen und Wohnungen/Gewerbe/Technik, dargestellt in 3D (`src/components/Gebaeude3D.tsx`, `Baustelle3D.tsx`, three.js wird nur dort nachgeladen). Aufgaben und Termine können optional genau einem Bereich zugeordnet werden (`gebaeude_id` **oder** `geschoss_id` **oder** `einheit_id`); Fortschritt/Status wird daraus berechnet (`src/lib/gebaeude3d.ts`), nicht gespeichert. „Aus Plänen aufbauen“ liest Grundriss-PDFs aus und speichert je Geschoss Umriss, Planbild und Einheiten-Positionen (`src/lib/planAnalyse.ts`)
- `tagesberichte` — Bautagebuch-Einträge je Tag/Projekt
- `zeiterfassung` — Arbeitszeiten je Mitarbeiter/Projekt
- `auth.users`, `auth.mfa_factors`, `auth.sitzungen` — Logins, 2FA, Sitzungen (nur für das Backend lesbar)
- `storage.objects` — Metadaten der Dateien; die Dateien selbst liegen unter `/var/lib/workflow/dateien/<bereich>/<pfad>`

Mandantenfähig: Daten sind strikt pro Firma (`unternehmen`) getrennt (Row Level Security), innerhalb einer Firma sieht/bearbeitet jeder eingeloggte Nutzer je nach Rolle die gemeinsamen Daten. Neue Firma anlegen: [docs/firma-erstellen.md](docs/firma-erstellen.md).
