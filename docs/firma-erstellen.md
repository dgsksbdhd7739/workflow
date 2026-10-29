# Neue Firma anlegen

WorkFlow ist mandantenfähig: mehrere Firmen können dieselbe App nutzen, ohne dass sie gegenseitig ihre Daten sehen (Projekte, Aufgaben, Nutzer, Statusvorlagen etc. sind strikt pro Firma getrennt, umgesetzt per Row Level Security, siehe [server/db/migrationen/0001_basis.sql](../server/db/migrationen/0001_basis.sql)).

Es gibt bewusst **keine Selbstregistrierung** — eine neue Firma entsteht nur über das Skript unten oder über die **Plattform-Verwaltung** in der App (`/plattform-admin`, nur für Einträge in `plattform_admins` sichtbar). Kein normaler Nutzer, auch kein Admin einer bestehenden Firma, kann selbst eine neue Firma anlegen oder eine fremde sehen.

## Plattform-Verwaltung (In-App)

- **Firma anlegen:** Name, Admin-E-Mail, **Paket** (Starter/Team/Business) und Nutzerlimit (vorbelegt mit dem Standard des Pakets, anpassbar). Das Passwort wird generiert und einmalig angezeigt.
- **Firma bearbeiten:** *Bearbeiten* an der Firma → Paket und Nutzerlimit ändern (leer = unbegrenzt) sowie Firmendaten (Adresse, Kontakt, Logo) pflegen.
- Paket (`unternehmen.paket`) und Nutzerlimit (`unternehmen.max_nutzer`) kann nur ein Plattform-Admin ändern; ein DB-Trigger blockiert Änderungen durch Firmen-Admins.

## Pakete (`paket_erlaubt_fuer()` in der Datenbank, `src/lib/pakete.ts`)

| | Starter | Team | Business |
|---|---|---|---|
| Nutzer (Standard) | 5 | 15 | 30 |
| Aktive Projekte | max. 5 | unbegrenzt | unbegrenzt |
| Grundfunktionen (Aufgaben, Pläne, Bautagebuch, Zeiterfassung, Team-Chat) | ✓ | ✓ | ✓ |
| Projekt-Chat, Dokumente, Termine, Material/Materialstamm, eigene Vorlagen, Kunden-Zugänge | – | ✓ | ✓ |
| Modul-Sperren pro Nutzer | – | – | ✓ |

- Durchgesetzt wird serverseitig: restriktive RLS-Policies auf Anlegen/Ändern (`paket_erlaubt()`), Trigger für das Projektlimit und die Rolle „Kunde“, Prüfung in `create-user`. Die App zeigt gesperrte Funktionen mit Schloss und einen Hinweis statt des Inhalts.
- Nach einem Downgrade bleiben vorhandene Daten lesbar und löschbar, nur Neues anlegen bzw. Ändern ist gesperrt.
- Ohne Paketangabe (z. B. über das Skript) legt `create-unternehmen` eine Firma im Team-Paket an. Bestandsfirmen wurden auf Business gesetzt.
- Enterprise und Speicher-Kontingente (5/20/50 GB) sind noch nicht technisch umgesetzt.
- Beide Listen (`pakete.ts` und `paket_erlaubt_fuer()`) müssen bei Änderungen synchron gehalten werden.

## Voraussetzung

`.env` im Projektroot muss `PROVISION_SECRET` enthalten (gleicher Wert wie `PROVISION_SECRET` in `/etc/workflow/server.env` auf dem Server) und optional `VITE_API_URL` (Standard: `https://217-154-200-72.sslip.io`), siehe `.env.example`.

## Ablauf

```bash
node scripts/create-unternehmen.mjs "Name der Firma GmbH" admin@firma-des-kunden.de "Vorname Nachname"
```

- **1. Parameter** — Firmenname (erscheint z. B. im Kopf von PDF-Exporten)
- **2. Parameter** — E-Mail-Adresse des ersten Admin-Accounts dieser Firma
- **3. Parameter** (optional) — Name der Person, die diesen Account bekommt

Das Skript legt an:

1. eine neue Zeile in `unternehmen`,
2. einen Login (`auth.users`) mit zufällig generiertem Passwort,
3. das zugehörige Profil mit Rolle `admin` und Zuordnung zur neuen Firma.

Ausgabe:

```
Firma "Name der Firma GmbH" angelegt (unternehmen_id: ...)
Admin-Login:
  E-Mail:    admin@firma-des-kunden.de
  Passwort:  <zufällig>
```

## Danach

- Zugangsdaten sicher an den Kunden übermitteln (nicht per unverschlüsselter Mail).
- Der Admin muss das Passwort beim ersten Login ändern (`muss_passwort_aendern`, wie bei jedem neu angelegten Nutzer).
- Direkt danach muss der Firmen-Admin die Firmendaten pflegen (Name, Adresse, Land, Telefon, E-Mail, Logo — Website optional), sonst kommt er nicht weiter (`/firmendaten-einrichten`, Pflichtfelder in `src/lib/firmendaten.ts`). Der Plattform-Admin ist davon ausgenommen.
- Weitere Nutzer legt der Admin der neuen Firma anschließend selbst über *Einstellungen → Nutzerverwaltung* an — dafür ist kein weiterer Eingriff nötig.

## Technischer Hintergrund

- Backend-Funktion: `POST /api/funktionen/create-unternehmen` in [server/src/funktionen/routen.ts](../server/src/funktionen/routen.ts) — entweder als angemeldeter Plattform-Admin (In-App) oder ohne Login über ein Shared Secret (`x-provision-secret`-Header, Skript). Firma, Login und Admin-Rolle entstehen in einer Transaktion.
- `handle_new_user()` (DB-Trigger auf `auth.users`) liest `unternehmen_id` aus `raw_user_meta_data` des neuen Logins und ordnet das Profil entsprechend zu, statt wie früher jeden neuen Nutzer hart der ältesten Firma zuzuordnen.
- Deployment bei Änderungen: `npm run deploy-server`.

## Was noch fehlt

Bezahlung/Abo ist bewusst noch nicht angebunden — eine neue Firma ist sofort und uneingeschränkt nutzbar. Rechtliche Absicherung (Impressum/Datenschutzerklärung/AGB/AVV) für zahlende Fremdkunden ist ebenfalls noch offen und braucht fachanwaltliche Beratung, siehe Projektnotizen.
