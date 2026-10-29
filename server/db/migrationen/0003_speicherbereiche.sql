-- Die privaten Speicherbereiche der App. Unter Supabase per Dashboard/
-- Migration angelegt und daher nur als Daten uebernommen; hier fest verankert,
-- damit auch eine frisch aufgebaute Datenbank Uploads annimmt
-- (storage.objects.bucket_id verweist darauf). Muss zur Liste BUCKETS in
-- server/src/dateien/routen.ts passen.
insert into storage.buckets (id, name, public)
values
  ('mangel-fotos', 'mangel-fotos', false),
  ('plaene', 'plaene', false),
  ('projekt-logos', 'projekt-logos', false),
  ('dokumente', 'dokumente', false),
  ('unternehmen-logos', 'unternehmen-logos', false),
  ('tagesbericht-vorlagen', 'tagesbericht-vorlagen', false)
on conflict (id) do nothing;

insert into private.schema_migrationen (name)
values ('0003_speicherbereiche.sql')
on conflict do nothing;
