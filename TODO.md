# TODO

Regeln für Claude:
- Jeden Punkt eigenständig abarbeiten, ohne Rückfrage, sobald er hier steht.
- Nach Erledigung: Punkt abhaken `[x]` und kurze Notiz (was gemacht wurde / Commit) dranschreiben.
- Wenn ein Punkt unklar ist und wirklich nicht ohne Rückfrage lösbar ist: als `[?]` markieren mit kurzer Frage, weitermachen mit dem nächsten Punkt statt zu blockieren.
- Diese Datei ist die einzige Quelle der Wahrheit für offene Aufgaben (übersteht Abstürze).

## Offen

- [x] 1. Alle Begriffe mit "Baustelle" gegen "Projekt" oder "Objekt" ändern. → "Projekt"/"Projekte" gewählt. Routen, Typen, Variablen, UI-Texte umbenannt.
- [x] 2. Begriff "Maengel"/"Mängel" gegen "Aufgabe" ändern. → Typ `Mangel`→`Aufgabe`, Dateien/Routen umbenannt, keine Kollision.
- [x] 3. Homepage: PDF-Auto-Import-Hinweis. → Reale Plan-OCR-Funktion beworben (landing/index.html).
- [x] 4. Wetterabruf/-angaben vollständig entfernt. → Code + Homepage-Text bereinigt.
- [x] 5. DB-Schema-Migration (0035): Tabellen `baustellen`→`projekte`, `baustelle_kunden`→`projekt_kunden`, `maengel`→`aufgaben`, `mangel_material`→`aufgabe_material`, `mangel_kommentare`→`aufgabe_kommentare`, `mangel_phasen`→`aufgabe_phasen`; Spalten `baustelle_id`→`projekt_id`, `mangel_id`→`aufgabe_id` überall; 4 Hilfsfunktionen umbenannt + Funktionskörper (Trigger, RLS-Helper) nachgezogen; erfolgreich auf Produktions-DB angewendet (`supabase db push`), Datenbestand geprüft unverändert (Row-Counts vor/nach identisch). Frontend-Code auf neue Tabellen-/Spaltennamen umgestellt.
  - Storage-Bucket `mangel-fotos` bewusst NICHT umbenannt — das würde alle bestehenden Foto-Dateien in einen neuen Bucket kopieren müssen (kein reiner Metadaten-Rename wie bei Tabellen/Spalten). Eigenständiges, riskanteres Vorhaben falls gewünscht.
- [x] 6. DB-Migration (0036): Spalten `wetter`/`temperatur` aus `tagesberichte` gedroppt (Daten aus der Vergangenheit damit unwiderruflich gelöscht, wie angekündigt).
- [x] 7. VS-Code-Java-Classpath-Fehler bei MainActivity.java behoben (Ursache: Android-Gradle-Projekt wurde vom Java-Sprachserver nie importiert, kein echter Code-Fehler). `.vscode/settings.json`: `java.configuration.updateBuildConfiguration` von `interactive` auf `automatic` gestellt. **Einmal VS Code neu laden/Fenster neu starten**, damit der Java-Sprachserver das Android-Projekt neu einliest.
- [x] 8. Volle Verifikation nach DB-Migration: `oxlint` sauber, `tsc --noEmit` sauber, `npm run build` sauber. Es gibt kein automatisiertes Testsuite (kein `npm test` im Projekt) — stattdessen echten Login-Flow per Playwright gegen die Produktions-DB durchgespielt: Login, Projekt öffnen, Aufgaben-Liste, Tagesberichte (kein Wetter-Feld mehr, weder Liste noch Formular), Dokumente — alles fehlerfrei, inkl. eines echten Schreibtests (Aufgabe angelegt + wieder gelöscht). Kein einziger "relation/column does not exist"-Fehler.

## Erledigt

