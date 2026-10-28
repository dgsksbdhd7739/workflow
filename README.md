# WorkFlow

Projekt-Management-App: Aufgabenmanagement, Pläne mit Markierungen, Bautagebuch/Tagesberichte und Zeiterfassung. Läuft als Web-App (Browser), Android-App (Capacitor) und Windows-Desktop-App (Tauri) aus derselben React/TypeScript-Codebasis.

## Tech-Stack

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, React Router
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime) — Projekt-Ref `hcujlcihieskekyukisc`, Region Frankfurt (`eu-central-1`)
- **Android:** Capacitor (`android/`)
- **Windows:** Tauri (`src-tauri/`)

## Setup

```bash
npm install
cp .env.example .env   # Werte aus Supabase-Dashboard eintragen
npm run dev             # Web, http://localhost:5173
```

### Lokale Demo ohne Supabase

Wenn Supabase nicht konfiguriert ist, startet WorkFlow automatisch direkt in einer lokalen Gebäude-Demo ohne Anmeldung. Sind Supabase-Werte in `.env` vorhanden, lässt sich die Verbindung für einen lokalen Build ausdrücklich abschalten, indem `VITE_LOKALE_DEMO=true` gesetzt wird. Die Demo zeigt ausschließlich Beispieldaten; Änderungen werden im lokalen Browser-/App-Speicher abgelegt und nicht mit anderen Geräten synchronisiert. Die lokale Demo ist kein Ersatz für Authentifizierung oder die echte, mandantengetrennte Projektdatenbank.

## Datenbank-Migrationen

Schema liegt in `supabase/migrations/`. Anwenden auf das verlinkte Supabase-Projekt:

```bash
npx supabase db push
```

## Plattform-Builds

```bash
npm run build            # Web-Build nach dist/
npm run android          # Capacitor: synct dist/ und öffnet Android Studio
npx tauri dev             # Windows-Desktop, Entwicklung
npx tauri build           # Windows-Desktop, Release-Installer
```

## Datenmodell (Kurzüberblick)

- `baustellen` — Projekte (oberste Ebene; Tabellenname historisch, in der UI durchgängig "Projekt" genannt)
- `maengel` — Aufgaben je Projekt, mit Status/Priorität/Foto/optionaler Plan-Position (Tabellenname historisch, in der UI "Aufgabe" genannt)
- `plaene` + `plan_markierungen` — hochgeladene Pläne und Pins darauf
- `gebaeude` — Gebäude je Projekt als Einstieg für die schrittweise Gebäude-/Geschossübersicht; Pläne und Aufgaben bleiben zunächst projektweit
- `tagesberichte` — Bautagebuch-Einträge je Tag/Projekt
- `zeiterfassung` — Arbeitszeiten je Mitarbeiter/Projekt

Mandantenfähig: Daten sind strikt pro Firma (`unternehmen`) getrennt (Row Level Security), innerhalb einer Firma sieht/bearbeitet jeder eingeloggte Nutzer je nach Rolle die gemeinsamen Daten. Neue Firma anlegen: [docs/firma-erstellen.md](docs/firma-erstellen.md).
