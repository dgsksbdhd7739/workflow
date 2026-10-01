-- Schliesst eine Mandantentrennungs-Luecke im tagesbericht-vorlagen-Bucket
-- (seit 0048): die SELECT/UPDATE/DELETE-Policies pruefen bisher nur die
-- Rolle, nicht aber ob die Datei zum eigenen Unternehmen gehoert -- anders
-- als bei den uebrigen Buckets (mangel-fotos/plaene/dokumente/*-logos),
-- die in 0033_mandantentrennung.sql bereits auf Pfad-Ebene (erster
-- Pfadteil = eigene unternehmen_id/baustelle_id) abgesichert wurden. Damit
-- konnte bislang jeder eingeloggte Nutzer (unabhaengig vom Unternehmen) eine
-- Datei einer fremden Firma lesen/aendern/loeschen, sofern er den Pfad
-- kennt. Dateien liegen unter "<unternehmen_id>/<timestamp>-<name>"
-- (siehe uploadFile-Aufruf in TagesberichtVorlagen.tsx), daher reicht die
-- bereits vorhandene Hilfsfunktion unternehmen_ordner_erlaubt() aus 0033.

drop policy if exists "tagesbericht-vorlagen-bucket: eingeloggte Nutzer lesen" on storage.objects;
drop policy if exists "tagesbericht-vorlagen-bucket: admin/planer hochladen" on storage.objects;
drop policy if exists "tagesbericht-vorlagen-bucket: admin/planer aendern" on storage.objects;
drop policy if exists "tagesbericht-vorlagen-bucket: admin/planer loeschen" on storage.objects;

create policy "tagesbericht-vorlagen-bucket: zugriffsberechtigte lesen"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'tagesbericht-vorlagen' and public.unternehmen_ordner_erlaubt(name));

create policy "tagesbericht-vorlagen-bucket: admin/planer hochladen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'tagesbericht-vorlagen' and public.current_role() in ('admin', 'planer') and public.unternehmen_ordner_erlaubt(name));

create policy "tagesbericht-vorlagen-bucket: admin/planer aendern"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'tagesbericht-vorlagen' and public.current_role() in ('admin', 'planer') and public.unternehmen_ordner_erlaubt(name));

create policy "tagesbericht-vorlagen-bucket: admin/planer loeschen"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'tagesbericht-vorlagen' and public.current_role() in ('admin', 'planer') and public.unternehmen_ordner_erlaubt(name));
