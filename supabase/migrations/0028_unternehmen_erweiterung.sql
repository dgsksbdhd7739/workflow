-- Erweitert das Unternehmen um Firmenlogo und Kontaktdaten, damit diese auf
-- Baustellenberichten (PDF-Exporte) mit angezeigt werden koennen. Bearbeiten
-- bleibt admin/planer vorbehalten (dieselben Rollen wie beim Projekt bearbeiten).

alter table public.unternehmen
  add column logo_pfad text,
  add column strasse text,
  add column hausnummer text,
  add column plz text,
  add column stadt text,
  add column land text,
  add column telefon text,
  add column email text,
  add column website text;

create policy "unternehmen: admin/planer aktualisieren"
  on public.unternehmen for update
  to authenticated
  using (id = public.current_unternehmen_id() and public.current_role() in ('admin', 'planer'))
  with check (id = public.current_unternehmen_id() and public.current_role() in ('admin', 'planer'));

-- Unternehmenslogos: privater Bucket, Lesen fuer alle eingeloggten Nutzer,
-- Schreiben nur admin/planer (analog zu projekt-logos).

insert into storage.buckets (id, name, public)
values ('unternehmen-logos', 'unternehmen-logos', false)
on conflict (id) do nothing;

create policy "unternehmen-logos: eingeloggte Nutzer lesen"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'unternehmen-logos');

create policy "unternehmen-logos: admin/planer hochladen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'unternehmen-logos' and public.current_role() in ('admin', 'planer'));

create policy "unternehmen-logos: admin/planer aendern"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'unternehmen-logos' and public.current_role() in ('admin', 'planer'));

create policy "unternehmen-logos: admin/planer loeschen"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'unternehmen-logos' and public.current_role() in ('admin', 'planer'));
