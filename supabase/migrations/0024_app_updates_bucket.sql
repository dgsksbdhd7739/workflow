-- Oeffentlicher Storage-Bucket fuer die Live-Update-Bundles (JS/CSS/HTML
-- der App, siehe @capgo/capacitor-updater). Enthaelt keine sensiblen Daten
-- (nur der kompilierte Web-Build), oeffentliches Lesen ist hier bewusst und
-- unbedenklich -- die App muss die Update-Datei ohne Login abrufen koennen.

insert into storage.buckets (id, name, public)
values ('app-updates', 'app-updates', true)
on conflict (id) do nothing;
