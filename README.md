# WorkFlow

**Projekt-Management für Bau- und Handwerksbetriebe** – Aufgaben und Mängel, Pläne mit Markierungen, Gebäude in 3D, Bautagebuch, Zeiterfassung und Chat in einer App. Läuft im Browser, als Android-App und als Windows-Programm aus derselben Codebasis.

WorkFlow ist mandantenfähig: Mehrere Firmen nutzen dieselbe Installation, ihre Daten sind über Row Level Security in der Datenbank strikt voneinander getrennt.

---

## Funktionen

| Bereich | Was es kann |
|---|---|
| **Projekte** | Projektübersicht mit Kennzahlen, Favoriten, Archiv, Projekt-Logos |
| **Aufgaben & Mängel** | Status, Priorität, Fälligkeit, Verantwortliche, Fotos, Kommentare, Material, Tickets, Listen- und Board-Ansicht, gespeicherte Filter, PDF-Export |
| **Pläne** | PDF- und Bildpläne hochladen (auch mehrseitige PDFs), Markierungen als Punkt oder Rechteck direkt auf dem Plan, scharfes Zoomen auch bei großen Werkplänen |
| **Gebäude in 3D** | Geschosse und Wohnungen/Zimmer, Status-Einfärbung aus den Aufgaben, Baustellenansicht aller Gebäude. „Aus Plänen aufbauen“ liest Grundriss-PDFs aus (Geschoss, Maßstab, Umriss, Zimmernummern, Achsraster) und legt die Etagen deckungsgleich übereinander |
| **Bautagebuch** | Tagesberichte mit Vorlagen, PDF-Ausgabe |
| **Zeiterfassung** | Arbeitszeiten je Mitarbeiter, Projekt und Aufgabe |
| **Termine & Dokumente** | Termine mit Verzugsanzeige, Dokumentenablage mit Ordnern und Freigaben |
| **Kommunikation** | Team-Chat und Projekt-Chat in Echtzeit, Push-Benachrichtigungen (Android) |
| **Verwaltung** | Rollen (Admin, Planer, Techniker, Kunde), Nutzer anlegen/sperren, Zwei-Faktor-Anmeldung, angemeldete Geräte, Pakete mit Nutzerlimit |
| **Plattform-Betrieb** | Firmen anlegen, stilllegen und löschen; Serverzustand (CPU, RAM, Festplatte, Dienste, Sicherung) direkt im Dashboard |

---

## Technik

| Teil | Stack |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, React Router; 3D mit three.js / React Three Fiber (nur bei Bedarf nachgeladen); pdf.js für Pläne |
| **Backend** (`server/`) | Node.js 24 (führt TypeScript direkt aus), Fastify, PostgreSQL 17 |
| **Android** (`android/`) | Capacitor 8, Live-Updates über `@capgo/capacitor-updater` vom eigenen Server |
| **Windows** (`src-tauri/`) | Tauri 2 |
| **Betrieb** | Eigener Linux-Server (Ubuntu 24.04) mit nginx, Let's Encrypt, systemd, nächtlicher Sicherung |

### Architektur in einem Satz

Die Zugriffsregeln stecken **in der Datenbank**: Das Backend führt jede Anfrage in einer Transaktion als Rolle `authenticated` mit den Claims des angemeldeten Nutzers aus – so trennen die Row-Level-Security-Policies die Firmen, nicht der Anwendungscode.

```
Browser / Android / Windows
          │  HTTPS, WebSocket
          ▼
   nginx ──► Backend (Fastify, server/) ──► PostgreSQL (RLS)
                     │
                     └──► Dateiablage /var/lib/workflow/dateien
```

**Endpunkte des Backends**

| Pfad | Zweck |
|---|---|
| `/api/auth/*` | Anmeldung, Zwei-Faktor (TOTP), Sitzungen, Passwort |
| `/api/daten/:tabelle` | Generische Datenschnittstelle – nur Tabellen mit aktivem RLS, Werte ausschließlich als Parameter |
| `/api/rpc/:name` | Freigegebene Datenbankfunktionen |
| `/api/dateien/*` | Upload, signierte Download-Links, Löschen (berechtigt über Policies) |
| `/api/funktionen/*` | Nutzer- und Firmenverwaltung |
| `/api/live` | WebSocket für die Chats |
| `/api/betrieb/serverzustand` | Serverauslastung und Verlauf (nur Plattform-Admins) |

---

## Projektstruktur

```
src/                Frontend
  pages/            Seiten
  components/       Wiederverwendbare Komponenten (inkl. 3D-Ansichten)
  lib/              Domain- und Hilfslogik (backend.ts = API-Client, planAnalyse.ts = Planauswertung)
server/             Backend
  src/              Fastify-App (auth, daten, dateien, funktionen, live, betrieb, push)
  db/migrationen/   SQL-Migrationen, fortlaufend nummeriert
  test/             Tests gegen eine echte Test-Datenbank
android/            Capacitor-Projekt
src-tauri/          Windows-App
scripts/            Deploy, Live-Update, Server-Ersteinrichtung
landing/            Landingpage und APK-Download
docs/               Betriebsanleitungen
```

---

## Entwicklung

### Voraussetzungen

- Node.js 24
- Für Android: Android Studio (JDK aus Android Studio verwenden)
- Für Windows: Rust und die Tauri-Voraussetzungen

### Frontend

```bash
npm install
cp .env.example .env      # VITE_API_URL = Adresse des Backends
npm run dev               # http://localhost:5173
npm run build             # Produktions-Build nach dist/
npm run lint
```

Ohne Backend: `VITE_LOKALE_DEMO=true` startet eine lokale Gebäude-Demo mit Beispieldaten (keine Anmeldung, keine Synchronisation).

### Backend

```bash
cd server
npm install
cp .env.example .env      # Datenbank-Zugang und JWT_SECRET eintragen
npm run typecheck
npm test                  # braucht TEST_DATABASE_URL (wird geleert und neu befüllt)
npm start
```

### Datenbank-Migrationen

Liegen in `server/db/migrationen/` und werden beim Backend-Deploy automatisch eingespielt. Manuell auf dem Server:

```bash
sudo -u postgres /opt/workflow/server/scripts/migrieren.sh workflow
```

Neue Tabellen mit Firmen- oder Projektbezug brauchen immer eine RLS-Policy – ohne aktives RLS ist eine Tabelle über die API gar nicht erreichbar.

### Mandantentrennung prüfen

`server/scripts/mandanten-pruefung.ts` simuliert jeden Nutzer gegen eine Kopie der Datenbank und meldet Zeilen, die er nicht sehen dürfte.

---

## Betrieb und Deploy

Es gibt keine CI/CD – alle Wege werden bewusst manuell ausgelöst:

```bash
npm run deploy-server             # Backend + Migrationen, Neustart mit automatischem Rückfall
npm run deploy-vps                # Web-App und Landingpage
node scripts/publish-update.mjs   # Live-Update für installierte Android-Apps
```

- **Server neu einrichten:** [`scripts/vps-setup.sh`](scripts/vps-setup.sh) (nginx, Zertifikate, PostgreSQL, Node, Dienst, Sicherung)
- **Neue Firma anlegen:** in der App unter Plattform-Verwaltung oder per Skript, siehe [`docs/firma-erstellen.md`](docs/firma-erstellen.md)
- **Android-APK:** `npm run build` → `npx cap sync android` → `gradlew assembleRelease`. Die Release-APK heißt `WorkFlow-v<version>.apk`.

---

## Sicherheit

- Keine Zugangsdaten im Repository: echte Werte liegen nur in `.env` (lokal) bzw. `/etc/workflow/server.env` (Server); beide sind von Git ausgeschlossen. `*.env.example` enthält nur Platzhalter.
- Passwörter als bcrypt-Hash, Zwei-Faktor-Anmeldung serverseitig erzwungen, jeder TOTP-Code nur einmal gültig.
- Sitzungen werden bei jeder Anfrage geprüft – Sperren, Abmelden und Stilllegen wirken sofort.
- Anmeldeversuche pro IP begrenzt, Datenbank nur lokal erreichbar, Dateien nur über kurzlebige signierte Links.

Sicherheitslücken bitte nicht als öffentliches Issue melden, sondern direkt an den Betreiber.

---

## Weitere Dokumente

- [`Agents.md`](Agents.md) – ausführlicher technischer Stand und Architekturregeln
- [`CLAUDE.md`](CLAUDE.md) – Arbeitsregeln für die Entwicklung mit Claude Code
- [`TODO.md`](TODO.md) – offene Punkte
- In-App-Änderungsprotokoll: [`src/lib/changelog.ts`](src/lib/changelog.ts)
