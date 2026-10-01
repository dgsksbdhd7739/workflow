-- Plattform-Admin: eine von jeder Firma unabhaengige Berechtigung, neue
-- Unternehmen anzulegen -- bewusst als eigene Tabelle statt als Rolle auf
-- profiles, damit sie niemals versehentlich ueber die normale
-- Rollen-Verwaltung (Nutzerverwaltung, pro Unternehmen) vergeben werden
-- kann. Es gibt bewusst keine UI, um weitere Plattform-Admins hinzuzufuegen
-- -- das bleibt manuelle Datenbankarbeit, analog zum bisherigen
-- PROVISION_SECRET-Ansatz.

create table public.plattform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  erstellt_am timestamptz not null default now()
);

alter table public.plattform_admins enable row level security;

create policy "plattform_admins: nur eigenen Eintrag lesen"
  on public.plattform_admins for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.ist_plattform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.plattform_admins where user_id = auth.uid())
$$;

-- Nutzerlimit je Unternehmen (NULL = unbegrenzt, Default fuer Bestandsfirmen).
alter table public.unternehmen add column max_nutzer integer;

-- Uebersicht fuer die Plattform-Admin-Seite: Name, Nutzerlimit und
-- tatsaechliche Nutzeranzahl je Firma. Als security-definer-Funktion statt
-- einer RLS-Policy auf unternehmen/profiles umgesetzt, damit normale
-- Nutzer weiterhin nur ihre eigene Firma sehen (bestehende Policies aus
-- 0020/0033 bleiben unberuehrt) und keine zusaetzliche Policy noetig ist,
-- die versehentlich zu weit oeffnet.
create or replace function public.plattform_unternehmen_uebersicht()
returns table (id uuid, name text, max_nutzer integer, nutzer_anzahl bigint, erstellt_am timestamptz)
language sql stable security definer set search_path = public
as $$
  select u.id, u.name, u.max_nutzer, count(p.id), u.erstellt_am
  from public.unternehmen u
  left join public.profiles p on p.unternehmen_id = u.id
  where public.ist_plattform_admin()
  group by u.id, u.name, u.max_nutzer, u.erstellt_am
  order by u.erstellt_am desc
$$;

-- Mesut Hano (bestehender RGS-Admin-Account) als ersten Plattform-Admin
-- eintragen -- der WorkFlow-Betreiber selbst, siehe Memory project_legal_texts.
insert into public.plattform_admins (user_id)
select p.id
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'mesut.hano@rgs-service-zugang.de'
on conflict do nothing;
