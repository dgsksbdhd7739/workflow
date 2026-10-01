-- Pakete je Firma (Starter/Team/Business, Enterprise bewusst noch nicht).
-- Funktionsumfang je Paket muss mit src/lib/pakete.ts uebereinstimmen.
--   starter : Grundfunktionen, max. 5 aktive Projekte
--   team    : + projekt_chat, dokumente, termine, material, vorlagen, kunden
--   business: + modulsperren
-- Gesperrt wird nur Anlegen/Aendern -- nach einem Paket-Downgrade bleiben
-- vorhandene Daten lesbar und loeschbar.

alter table public.unternehmen
  add column paket text not null default 'team'
  check (paket in ('starter', 'team', 'business'));

-- Bestandsfirmen (aktuell nur RGS) behalten den vollen Funktionsumfang;
-- ihr bisheriges Nutzerlimit bleibt unveraendert.
update public.unternehmen set paket = 'business';

create or replace function public.paket_erlaubt_fuer(p_unternehmen_id uuid, p_funktion text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case (select paket from public.unternehmen where id = p_unternehmen_id)
    when 'business' then true
    when 'team' then p_funktion in ('projekt_chat', 'dokumente', 'termine', 'material', 'vorlagen', 'kunden')
    else false
  end
$$;

create or replace function public.paket_erlaubt(p_funktion text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.paket_erlaubt_fuer(public.current_unternehmen_id(), p_funktion)
$$;

-- Restriktive Policies werden mit den bestehenden per UND verknuepft --
-- die vorhandenen Rechte (Rolle, Mandant) bleiben unveraendert.
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('projekt_chat_nachrichten', 'projekt_chat'),
      ('dokumente', 'dokumente'),
      ('dokument_ordner', 'dokumente'),
      ('dokument_freigaben', 'dokumente'),
      ('termine', 'termine'),
      ('aufgabe_material', 'material'),
      ('material_stamm', 'material'),
      ('statusvorlagen', 'vorlagen'),
      ('statusvorlage_werte', 'vorlagen'),
      ('ticket_formulare', 'vorlagen'),
      ('ticket_formular_felder', 'vorlagen'),
      ('tagesbericht_vorlagen', 'vorlagen'),
      ('nutzer_modul_sperren', 'modulsperren')
    ) as v(tabelle, funktion)
  loop
    execute format(
      'create policy "%1$s: paket anlegen" on public.%1$I as restrictive for insert to authenticated with check (public.paket_erlaubt(%2$L))',
      t.tabelle, t.funktion);
    execute format(
      'create policy "%1$s: paket aendern" on public.%1$I as restrictive for update to authenticated using (public.paket_erlaubt(%2$L))',
      t.tabelle, t.funktion);
  end loop;
end $$;

-- Aktive Projekte im Starter-Paket begrenzen (Anlegen und Wiederherstellen
-- aus dem Archiv). Service-Role (auth.uid() = null) ist ausgenommen.
create or replace function public.projekte_paket_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_paket text;
  v_aktiv bigint;
begin
  if auth.uid() is null or new.archiviert then
    return new;
  end if;
  if tg_op = 'UPDATE' and not old.archiviert then
    return new;
  end if;
  select paket into v_paket from public.unternehmen where id = new.unternehmen_id;
  if v_paket = 'starter' then
    select count(*) into v_aktiv from public.projekte
    where unternehmen_id = new.unternehmen_id and not archiviert and id <> new.id;
    if v_aktiv >= 5 then
      raise exception 'Im Starter-Paket sind maximal 5 aktive Projekte möglich. Bitte ein Projekt archivieren oder auf das Team-Paket wechseln.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger projekte_paket_limit
  before insert or update of archiviert on public.projekte
  for each row execute function public.projekte_paket_limit();

-- Rolle "kunde" erst ab Team-Paket (Rollenwechsel ueber die Nutzerverwaltung;
-- das Neuanlegen prueft die Edge Function create-user).
create or replace function public.profiles_kunde_paket()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'kunde'
     and (tg_op = 'INSERT' or old.role is distinct from 'kunde')
     and auth.uid() is not null
     and not public.paket_erlaubt_fuer(new.unternehmen_id, 'kunden') then
    raise exception 'Kunden-Zugänge sind erst ab dem Team-Paket verfügbar.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_kunde_paket
  before insert or update of role on public.profiles
  for each row execute function public.profiles_kunde_paket();

-- Paket (wie das Nutzerlimit) darf nur der Plattform-Admin aendern.
create or replace function public.unternehmen_max_nutzer_schuetzen()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (new.max_nutzer is distinct from old.max_nutzer or new.paket is distinct from old.paket)
     and auth.uid() is not null
     and not public.ist_plattform_admin() then
    raise exception 'Nur Plattform-Admins duerfen Paket und Nutzerlimit aendern'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Uebersicht um das Paket erweitern (Rueckgabetyp aendert sich -> neu anlegen).
drop function if exists public.plattform_unternehmen_uebersicht();
create function public.plattform_unternehmen_uebersicht()
returns table (id uuid, name text, paket text, max_nutzer integer, nutzer_anzahl bigint, erstellt_am timestamptz)
language sql stable security definer set search_path = public
as $$
  select u.id, u.name, u.paket, u.max_nutzer, public.unternehmen_nutzer_anzahl(u.id), u.erstellt_am
  from public.unternehmen u
  where public.ist_plattform_admin()
  order by u.erstellt_am desc
$$;
