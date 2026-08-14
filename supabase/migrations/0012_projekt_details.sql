-- Erweiterte Projektstammdaten: Logo, Projektnummer, Projektleitung,
-- Kunde, Laufzeit, Sprache, getrennte Projekt-/Kundenadresse. Anlegen
-- und Bearbeiten bleibt ueber die bestehenden baustellen-Policies
-- (Migration 0008) auf admin/planer beschraenkt.

alter table public.baustellen
  add column projektnummer text,
  add column projektleiter_id uuid references public.profiles(id) on delete set null,
  add column bauleitender_obermonteur_id uuid references public.profiles(id) on delete set null,
  add column kunde_name text,
  add column projekt_beginn date,
  add column projekt_ende date,
  add column sprache text not null default 'Deutsch',
  add column logo_pfad text,
  add column projekt_land text,
  add column projekt_strasse text,
  add column projekt_hausnummer text,
  add column projekt_adresszusatz text,
  add column projekt_plz text,
  add column projekt_stadt text,
  add column kunden_land text,
  add column kunden_strasse text,
  add column kunden_hausnummer text,
  add column kunden_adresszusatz text,
  add column kunden_plz text,
  add column kunden_stadt text;

-- Projektlogos: privater Bucket, Lesen fuer alle eingeloggten Nutzer,
-- Schreiben nur admin/planer (analog zur baustellen-Schreibrechte-Policy).

insert into storage.buckets (id, name, public)
values ('projekt-logos', 'projekt-logos', false)
on conflict (id) do nothing;

create policy "projekt-logos: eingeloggte Nutzer lesen"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'projekt-logos');

create policy "projekt-logos: admin/planer hochladen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'projekt-logos' and public.current_role() in ('admin', 'planer'));

create policy "projekt-logos: admin/planer aendern"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'projekt-logos' and public.current_role() in ('admin', 'planer'));

create policy "projekt-logos: admin/planer loeschen"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'projekt-logos' and public.current_role() in ('admin', 'planer'));
