-- Baustellenapp: initiales Schema
-- Vereinfachtes Berechtigungsmodell fuer v1: jeder eingeloggte Nutzer (ein Firmen-Team)
-- sieht und bearbeitet alle Daten. Feingranulare Rechte pro Baustelle sind fuer eine
-- spaetere Version vorgesehen.

create extension if not exists "pgcrypto";

-- Profile ---------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'arbeiter' check (role in ('admin', 'polier', 'arbeiter')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: alle eingeloggten Nutzer koennen lesen"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles: Nutzer kann eigenes Profil aktualisieren"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Legt bei neuer Registrierung automatisch ein Profil an
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Baustellen --------------------------------------------------------------

create table public.baustellen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  adresse text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.baustellen enable row level security;

create policy "baustellen: eingeloggte Nutzer voller Zugriff"
  on public.baustellen for all
  to authenticated
  using (true)
  with check (true);

-- Plaene --------------------------------------------------------------------

create table public.plaene (
  id uuid primary key default gen_random_uuid(),
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  name text not null,
  datei_url text not null,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

alter table public.plaene enable row level security;

create policy "plaene: eingeloggte Nutzer voller Zugriff"
  on public.plaene for all
  to authenticated
  using (true)
  with check (true);

-- Maengel ---------------------------------------------------------------

create table public.maengel (
  id uuid primary key default gen_random_uuid(),
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  titel text not null,
  beschreibung text,
  status text not null default 'offen' check (status in ('offen', 'in_bearbeitung', 'erledigt')),
  prioritaet text not null default 'mittel' check (prioritaet in ('niedrig', 'mittel', 'hoch')),
  verantwortlicher_id uuid references public.profiles(id),
  faellig_am date,
  foto_url text,
  plan_id uuid references public.plaene(id) on delete set null,
  position_x double precision,
  position_y double precision,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

alter table public.maengel enable row level security;

create policy "maengel: eingeloggte Nutzer voller Zugriff"
  on public.maengel for all
  to authenticated
  using (true)
  with check (true);

-- Plan-Markierungen (Pins auf Plaenen, optional mit Mangel verknuepft) -----

create table public.plan_markierungen (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plaene(id) on delete cascade,
  x double precision not null,
  y double precision not null,
  notiz text,
  mangel_id uuid references public.maengel(id) on delete set null,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

alter table public.plan_markierungen enable row level security;

create policy "plan_markierungen: eingeloggte Nutzer voller Zugriff"
  on public.plan_markierungen for all
  to authenticated
  using (true)
  with check (true);

-- Tagesberichte / Bautagebuch ---------------------------------------------

create table public.tagesberichte (
  id uuid primary key default gen_random_uuid(),
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  datum date not null default current_date,
  wetter text,
  temperatur numeric,
  personal_anzahl integer,
  taetigkeiten text,
  besonderheiten text,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now(),
  unique (baustelle_id, datum, erstellt_von)
);

alter table public.tagesberichte enable row level security;

create policy "tagesberichte: eingeloggte Nutzer voller Zugriff"
  on public.tagesberichte for all
  to authenticated
  using (true)
  with check (true);

-- Zeiterfassung -------------------------------------------------------------

create table public.zeiterfassung (
  id uuid primary key default gen_random_uuid(),
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  datum date not null default current_date,
  start_zeit time not null,
  end_zeit time,
  pause_minuten integer not null default 0,
  taetigkeit text,
  erstellt_am timestamptz not null default now()
);

alter table public.zeiterfassung enable row level security;

create policy "zeiterfassung: eingeloggte Nutzer voller Zugriff"
  on public.zeiterfassung for all
  to authenticated
  using (true)
  with check (true);

-- Storage: Fotos (Maengel) und Plaene (PDF/Bild) ---------------------------

insert into storage.buckets (id, name, public)
values ('mangel-fotos', 'mangel-fotos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('plaene', 'plaene', true)
on conflict (id) do nothing;

create policy "mangel-fotos: eingeloggte Nutzer lesen/schreiben"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'mangel-fotos')
  with check (bucket_id = 'mangel-fotos');

create policy "plaene-bucket: eingeloggte Nutzer lesen/schreiben"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'plaene')
  with check (bucket_id = 'plaene');
