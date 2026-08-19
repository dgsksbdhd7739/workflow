# Neue Firma anlegen

WorkFlow ist mandantenfähig: mehrere Firmen können dieselbe App nutzen, ohne dass sie gegenseitig ihre Daten sehen (Baustellen, Aufgaben, Nutzer, Statusvorlagen etc. sind strikt pro Firma getrennt, siehe Migration `supabase/migrations/0033_mandantentrennung.sql`).

Es gibt bewusst **keine Selbstregistrierung** — eine neue Firma entsteht nur über das Skript unten. Kein Nutzer, auch kein Admin einer bestehenden Firma, kann selbst eine neue Firma anlegen oder eine fremde sehen.

## Voraussetzung

`.env` im Projektroot muss `VITE_SUPABASE_URL` und `PROVISION_SECRET` enthalten (siehe `.env.example`).

## Ablauf

```bash
node scripts/create-unternehmen.mjs "Name der Firma GmbH" admin@firma-des-kunden.de "Vorname Nachname"
```

- **1. Parameter** — Firmenname (erscheint z. B. im Kopf von PDF-Exporten)
- **2. Parameter** — E-Mail-Adresse des ersten Admin-Accounts dieser Firma
- **3. Parameter** (optional) — Name der Person, die diesen Account bekommt

Das Skript legt an:

1. eine neue Zeile in `unternehmen`,
2. einen Auth-Account mit zufällig generiertem Passwort,
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
- Weitere Nutzer legt der Admin der neuen Firma anschließend selbst über *Einstellungen → Nutzerverwaltung* an — dafür ist kein weiterer Eingriff nötig.

## Technischer Hintergrund

- Edge-Function: `supabase/functions/create-unternehmen/` — abgesichert über ein Shared Secret (`x-provision-secret`-Header), kein Login nötig, gleiches Muster wie `publish-app-update`.
- `handle_new_user()` (DB-Trigger) liest `unternehmen_id` aus den `user_metadata` des neuen Auth-Accounts und ordnet das Profil entsprechend zu, statt wie früher jeden neuen Nutzer hart der ältesten Firma zuzuordnen.
- Deployment der Function bei Änderungen: `npx supabase functions deploy create-unternehmen --no-verify-jwt`.

## Was noch fehlt

Bezahlung/Abo ist bewusst noch nicht angebunden — eine neue Firma ist sofort und uneingeschränkt nutzbar. Rechtliche Absicherung (Impressum/Datenschutzerklärung/AGB/AVV) für zahlende Fremdkunden ist ebenfalls noch offen und braucht fachanwaltliche Beratung, siehe Projektnotizen.
