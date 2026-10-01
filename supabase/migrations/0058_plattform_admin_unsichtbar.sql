-- Plattform-Admins haengen technisch an einem Unternehmen (profiles braucht
-- eine unternehmen_id), sollen dort aber weder in Nutzerlisten auftauchen
-- noch das Nutzerlimit der Firma belegen.

-- Security definer, damit die Profil-Policy plattform_admins lesen kann,
-- ohne dass deren RLS (nur eigener Eintrag) greift.
create or replace function public.ist_plattform_admin_id(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.plattform_admins where user_id = p_user_id)
$$;

-- Profile: andere Nutzer derselben Firma sehen Plattform-Admins nicht mehr;
-- das eigene Profil bleibt fuer jeden immer lesbar.
drop policy if exists "profiles: eigenes Unternehmen lesen" on public.profiles;
create policy "profiles: eigenes Unternehmen lesen"
  on public.profiles for select
  to authenticated
  using (
    unternehmen_id = public.current_unternehmen_id()
    and (id = auth.uid() or not public.ist_plattform_admin_id(id))
  );

-- Nutzeranzahl je Firma ohne Plattform-Admins -- einzige Quelle fuer die
-- Limitpruefung (create-user) und die Plattform-Uebersicht.
create or replace function public.unternehmen_nutzer_anzahl(p_unternehmen_id uuid)
returns bigint
language sql stable security definer set search_path = public
as $$
  select count(*) from public.profiles p
  where p.unternehmen_id = p_unternehmen_id
    and not exists (select 1 from public.plattform_admins pa where pa.user_id = p.id)
$$;

revoke all on function public.unternehmen_nutzer_anzahl(uuid) from public, anon, authenticated;
grant execute on function public.unternehmen_nutzer_anzahl(uuid) to service_role;

create or replace function public.plattform_unternehmen_uebersicht()
returns table (id uuid, name text, max_nutzer integer, nutzer_anzahl bigint, erstellt_am timestamptz)
language sql stable security definer set search_path = public
as $$
  select u.id, u.name, u.max_nutzer, public.unternehmen_nutzer_anzahl(u.id), u.erstellt_am
  from public.unternehmen u
  where public.ist_plattform_admin()
  order by u.erstellt_am desc
$$;
