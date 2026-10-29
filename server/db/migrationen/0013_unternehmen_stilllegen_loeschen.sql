-- Plattform-Verwaltung: Firmen stilllegen und endgueltig loeschen.
--
-- Stilllegen: unternehmen.stillgelegt_am gesetzt -> kein Login, Sitzungen
-- enden (Pruefung im Backend, siehe server/src/auth/). Daten bleiben erhalten.
--
-- Loeschen: private.zeilen_loeschen() folgt allen Fremdschluesseln, die auf
-- eine Tabelle zeigen, und loescht abhaengige Zeilen zuerst (viele FKs auf
-- profiles/projekte haben kein ON DELETE CASCADE). Nur fuer das Backend
-- (service_role); die Aufruf-Pruefung (Plattform-Admin, nicht die eigene
-- Firma) steht in server/src/funktionen/routen.ts.

alter table public.unternehmen add column if not exists stillgelegt_am timestamptz;

drop function if exists public.plattform_unternehmen_uebersicht();
create function public.plattform_unternehmen_uebersicht()
  returns table(id uuid, name text, paket text, max_nutzer integer, nutzer_anzahl bigint, erstellt_am timestamptz, stillgelegt_am timestamptz)
  language sql stable security definer
  set search_path to 'public'
as $$
  select u.id, u.name, u.paket, u.max_nutzer, public.unternehmen_nutzer_anzahl(u.id), u.erstellt_am, u.stillgelegt_am
  from public.unternehmen u
  where public.ist_plattform_admin()
  order by u.erstellt_am desc
$$;
grant execute on function public.plattform_unternehmen_uebersicht() to authenticated, service_role;

-- Ist die Firma dieses Logins stillgelegt? (Anmeldung, Token-Erneuerung, jede Anfrage)
create or replace function public.firma_stillgelegt(p_user uuid)
  returns boolean
  language sql stable security definer
  set search_path to 'public'
as $$
  select exists (
    select 1 from public.profiles p join public.unternehmen u on u.id = p.unternehmen_id
     where p.id = p_user and u.stillgelegt_am is not null
  )
$$;
revoke all on function public.firma_stillgelegt(uuid) from public;
grant execute on function public.firma_stillgelegt(uuid) to service_role;

create or replace function private.zeilen_loeschen(p_tabelle regclass, p_bedingung text, p_tiefe int default 0)
  returns void
  language plpgsql
  security definer
  set search_path to 'pg_catalog'
as $$
declare
  fk record;
  kind_spalten text;
  eltern_spalten text;
begin
  if p_tiefe > 15 then
    raise exception 'Loeschkette zu tief bei %', p_tabelle;
  end if;
  -- Abhaengige Zeilen zuerst; ON DELETE SET NULL/DEFAULT erledigt Postgres selbst.
  -- Selbstbezuege (z. B. Ordner in Ordnern) werden in einem Statement mitgeloescht.
  for fk in
    select c.conrelid::regclass as kind, c.conkey, c.confkey
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid = p_tabelle
       and c.conrelid <> p_tabelle
       and c.confdeltype in ('a', 'r', 'c')
  loop
    select string_agg(format('%I', a.attname), ',' order by k.ord) into kind_spalten
      from unnest(fk.conkey) with ordinality k(n, ord)
      join pg_attribute a on a.attrelid = fk.kind and a.attnum = k.n;
    select string_agg(format('%I', a.attname), ',' order by k.ord) into eltern_spalten
      from unnest(fk.confkey) with ordinality k(n, ord)
      join pg_attribute a on a.attrelid = p_tabelle and a.attnum = k.n;
    perform private.zeilen_loeschen(
      fk.kind,
      format('(%s) in (select %s from %s where %s)', kind_spalten, eltern_spalten, p_tabelle, p_bedingung),
      p_tiefe + 1
    );
  end loop;
  execute format('delete from %s where %s', p_tabelle, p_bedingung);
end
$$;

-- Loescht eine Firma mit allen Daten und Logins. Liefert die Dateien, die das
-- Backend danach von der Platte entfernt (bucket, name).
create or replace function private.unternehmen_loeschen(p_unternehmen uuid)
  returns table(bucket_id text, name text)
  language plpgsql
  security definer
  set search_path to 'pg_catalog'
as $$
declare
  nutzer uuid[];
  ids text[];
begin
  select coalesce(array_agg(p.id), '{}') into nutzer from public.profiles p where p.unternehmen_id = p_unternehmen;
  -- Dateipfade beginnen mit Firmen-, Projekt- oder Aufgaben-ID (siehe uploadFile-Aufrufe)
  select array[p_unternehmen::text]
         || coalesce((select array_agg(pr.id::text) from public.projekte pr where pr.unternehmen_id = p_unternehmen), '{}')
         || coalesce((select array_agg(a.id::text) from public.aufgaben a
                        join public.projekte pr on pr.id = a.projekt_id
                       where pr.unternehmen_id = p_unternehmen), '{}')
    into ids;

  create temp table if not exists loesch_dateien (bucket_id text, name text) on commit drop;
  delete from loesch_dateien;
  insert into loesch_dateien
    select o.bucket_id, o.name from storage.objects o where string_to_array(o.name, '/') && ids;
  delete from storage.objects o where string_to_array(o.name, '/') && ids;

  perform private.zeilen_loeschen('public.unternehmen'::regclass, format('id = %L', p_unternehmen));
  if array_length(nutzer, 1) > 0 then
    perform private.zeilen_loeschen('auth.users'::regclass, format('id = any(%L::uuid[])', nutzer));
  end if;
  return query select d.bucket_id, d.name from loesch_dateien d;
end
$$;

revoke all on function private.zeilen_loeschen(regclass, text, int) from public;
revoke all on function private.unternehmen_loeschen(uuid) from public;
grant usage on schema private to service_role;
grant execute on function private.unternehmen_loeschen(uuid) to service_role;

insert into private.schema_migrationen (name)
values ('0013_unternehmen_stilllegen_loeschen.sql')
on conflict do nothing;
