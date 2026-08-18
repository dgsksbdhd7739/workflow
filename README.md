# WorkFlow

Baustellen-Management-App: Aufgabenmanagement, Pläne mit Markierungen, Bautagebuch/Tagesberichte und Zeiterfassung. Läuft als Web-App (Browser), Android-App (Capacitor) und Windows-Desktop-App (Tauri) aus derselben React/TypeScript-Codebasis.

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

- `baustellen` — Baustellen/Projekte (oberste Ebene)
- `maengel` — Mängel je Baustelle, mit Status/Priorität/Foto/optionaler Plan-Position
- `plaene` + `plan_markierungen` — hochgeladene Pläne und Pins darauf
- `tagesberichte` — Bautagebuch-Einträge je Tag/Baustelle
- `zeiterfassung` — Arbeitszeiten je Mitarbeiter/Baustelle

v1-Berechtigungsmodell: jeder eingeloggte Nutzer sieht/bearbeitet alle Daten (ein Firmen-Team). Feingranulare Rechte pro Baustelle sind für eine spätere Version vorgesehen.
