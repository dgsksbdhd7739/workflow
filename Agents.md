# Agents Log

## Projekt: WorkFlow (Baustellenapp)

### Aktueller Stand
Version/Änderungshistorie stehen im in-App-Changelog ([src/lib/changelog.ts](src/lib/changelog.ts), angezeigt über `ChangelogDialog`) sowie in `package.json` (`version`, JS-Bundle/Live-Update-Stand) und `android/app/build.gradle` (`versionCode`/`versionName`, native APK-Version — beide Versionsstände sind bewusst getrennt, siehe Live-Update-Architektur). Offene, noch nicht umgesetzte Punkte stehen in [TODO.md](TODO.md). Dieser Abschnitt hier enthält nur dauerhaft gültige, versionsübergreifende Fakten.

### Dauerhafte technische Vorgaben
- Frontend: React + TypeScript + Vite, Tailwind CSS, React Router.
- Backend: Supabase (Postgres, Auth, Storage, Realtime), Migrationen unter `supabase/migrations/`.
- Android: Capacitor (`android/`). Windows: Tauri (`src-tauri/`).
- Release-APK-Namenskonvention: `WorkFlow-v{versionName}.apk` (siehe `landing/index.html`) — kein anderes Namensschema verwenden.
- **Live-Update-Versionierung ist scharf:** `scripts/publish-update.mjs` veröffentlicht immer unter der aktuellen `package.json`-`version`. Der Update-Check auf dem Gerät (`src/lib/liveUpdate.ts`) vergleicht nur den Versions-*String* gegen das bereits installierte Bundle — wird ein Bugfix ohne Versionsbump erneut unter derselben Nummer hochgeladen, überspringen alle Geräte, die diese Nummer schon haben, den Download stillschweigend (kein Fehler, einfach kein Update). Vor jedem `publish-update.mjs`-Lauf zwingend `package.json`-`version` erhöhen — war die Ursache für einen echten Produktionsausfall (Projekt-Erstellung in der App durch stillstehendes Live-Update auf Vor-Rename-Code blockiert, siehe Version 1.4.3).
- **Root-SPA-Hosting migriert von Vercel auf eigenen VPS** (Stand 2026-09-07, laufende Migration): STRATO-VPS `217.154.200.72`, Ubuntu 24.04, Nginx + Let's Encrypt (Certbot, Auto-Renew eingerichtet). Deploy: `npm run deploy-vps` (baut das Projekt und lädt `dist/` sowie `landing/` per `scp` auf `/var/www/app` bzw. `/var/www/landing` hoch, siehe `scripts/deploy-vps.mjs`). Zugangsdaten in `.env`: `VPS_HOST`, `VPS_USER` (root), `VPS_SSH_KEY` (lokal unter `~/.ssh/workflow_vps_ed25519`, Public Key liegt auf dem Server in `~/.ssh/authorized_keys` — Passwort-SSH-Login ist auf diesem VPS deaktiviert, nur Key-Auth). Eigene Domain `workflow-app.de` ist bei STRATO bestellt, DNS-Verwaltung aber laut Kunde erst in ca. 30 Tagen (ab 2026-09-07) nutzbar. **Übergangslösung:** App läuft bis dahin unter `https://217-154-200-72.sslip.io` (sslip.io löst `<ip-mit-bindestrichen>.sslip.io` automatisch auf die eigene IP auf, dafür bereits ein echtes Let's-Encrypt-Zertifikat ausgestellt — kein Zertifikatsfehler). Sobald `workflow-app.de` bei STRATO aktivierbar ist: DNS-A-Records (`workflow-app.de`, `www`, `app.workflow-app.de`) auf `217.154.200.72` umstellen, danach `certbot --nginx -d app.workflow-app.de` ausführen; Nginx-Configs für beide echten Domains liegen bereits auf dem Server (`/etc/nginx/sites-available/app.workflow-app.de.conf` und `workflow-app.de.conf`), nur die Zertifikate fehlen noch. Landing-Page bleibt bewusst vorerst auf Vercel (zwei Vercel-Projekte `workflow-app`/`landing` sind weiterhin live und unverändert nutzbar als Fallback) — Migration der Landing-Page auf den VPS ist ein separater, noch offener Schritt, sobald die echte Domain aktiv ist. **Android-APK-Download in der Übergangszeit:** zusätzlich zum Link auf `workflow-app.de` (Vercel) ist die jeweils aktuelle APK auch direkt über den VPS erreichbar unter `https://217-154-200-72.sslip.io/workflow.apk` (nginx-Location in `217-154-200-72.sslip.io.conf`, aliast auf `/var/www/landing/assets/workflow.apk`). Bei jedem `npm run deploy-vps`-Lauf wird die Datei automatisch mit hochgeladen, die nginx-Location muss nicht erneut angelegt werden. Der `Content-Disposition`-Dateiname in dieser Location ist aber fest auf `WorkFlow-v1.5.0.apk` eingetragen (kein Platzhalter) — bei jedem künftigen APK-Rebuild zusätzlich zum `download`-Attribut in `landing/index.html` auch dort von Hand nachziehen, sonst trägt der über diesen Link heruntergeladene APK versehentlich den alten Versionsnamen.

### Architektur-Vorgaben
- Multi-Tenant über `unternehmen_id` + Row Level Security; siehe `docs/firma-erstellen.md` für Firmen-Provisionierung.
- DB-Terminologie folgt der UI: Tabellen/Spalten heißen `projekte`/`projekt_id` bzw. `aufgaben`/`aufgabe_id` (siehe Migration `0035_projekt_aufgabe_umbenennung.sql`).

## Dokumentationsprinzip

Bei jedem Arbeitspaket sollen folgende Artefakte synchron mitgeführt werden, sofern betroffen:
- betroffene README-/docs-Dateien (`README.md`, `docs/*.md`)
- in-App-Changelog (`src/lib/changelog.ts`) bei nutzersichtbaren Änderungen
- `Agents.md` bei bereichsübergreifenden Regel- oder Prozessänderungen
- `TODO.md` für offene Punkte

## Verbindlicher Agent-Arbeitsmodus

Diese Regeln gelten für jede Arbeitsanfrage in diesem Projekt.

Pflichtablauf pro Arbeitspaket:
1. `Agents.md` und `TODO.md` vor Beginn lesen, sie sind die verbindliche Arbeitsgrundlage für dieses Projekt.
2. Betroffene Bereiche identifizieren.
3. Zugehörige README-/docs-Datei im selben Arbeitspaket prüfen und bei Bedarf aktualisieren; falls für einen betroffenen Bereich keine Doku existiert, bei Bedarf neu anlegen.
4. Bei nutzersichtbaren Änderungen den in-App-Changelog (`src/lib/changelog.ts`) ergänzen.
5. Abschlussmeldung erst, wenn Code, betroffene Doku und Changelog synchron sind.
6. **Fokus-Regel:** Während der Bearbeitung höchste Konzentration auf Code-Integrität; keine unvollständigen Implementierungen hinterlassen.
7. **Integritätsprüfung vor Abschluss:** Vor jeder Abschlussmeldung Typecheck (`tsc -b` bzw. `npm run build`) und Lint (`npm run lint`) sauber durchlaufen lassen.
8. **Sprachvorgabe:** Antworten auf Deutsch, kurz und in Stichpunkten wo sinnvoll.
9. **Versions-Commit:** Nach einer bewussten Versionsänderung (neuer Eintrag im Changelog + `package.json`/`versionName`) Commit und Git-Tag (`vX.Y.Z` passend zur Version) selbstständig erledigen. **Push zu einem Remote wird vorher kurz angekündigt, nicht stillschweigend ausgeführt** — Ausnahme: der dokumentierte `/update`-Deploy-Workflow, der bereits vorab als voll-autonom autorisiert ist.
