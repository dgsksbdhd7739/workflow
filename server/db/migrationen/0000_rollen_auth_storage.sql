-- Grundlage fuer den Betrieb ohne Supabase.
--
-- Die bestehenden Tabellen, Funktionen und ~265 RLS-Policies (urspruenglich
-- unter supabase/migrations/) verweisen auf einige Supabase-Objekte:
-- Rollen anon/authenticated/service_role, auth.uid()/auth.role(),
-- auth.users (FK von profiles), storage.objects/storage.buckets (Datei-
-- Policies) und storage.foldername(). Diese Migration bildet genau diese
-- Objekte minimal nach -- mit identischen Namen, damit Policies und
-- Funktionen unveraendert weiterlaufen. Alles darueber hinaus (GoTrue-
-- Tabellen, Storage-API-Interna) entfaellt.
--
-- Das Backend (server/) verbindet sich als workflow_api (NOINHERIT, ohne
-- eigene Rechte) und wechselt pro Anfrage per SET LOCAL ROLE in
-- authenticated bzw. service_role; die Nutzer-ID kommt als
-- request.jwt.claims in die Transaktion -- derselbe Mechanismus wie bei
-- PostgREST, auf dem auth.uid() aufbaut.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'workflow_api') then
    -- Passwort setzt scripts/vps-setup.sh bzw. der Betreiber separat.
    create role workflow_api login noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to workflow_api;

-- ---------------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------------

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Spaltennamen wie bei Supabase/GoTrue, damit Altdaten 1:1 uebernommen werden
-- koennen und handle_new_user() (liest raw_user_meta_data) weiterlaeuft.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  encrypted_password text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_eindeutig on auth.users (lower(email));

-- TOTP-Faktoren; secret ist das Base32-Geheimnis (wie bei Supabase im Klartext,
-- die Tabelle ist nur fuer service_role lesbar).
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  friendly_name text,
  factor_type text not null default 'totp' check (factor_type = 'totp'),
  status text not null default 'unverified' check (status in ('unverified', 'verified')),
  secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mfa_factors_user_id on auth.mfa_factors (user_id);

-- Ersetzt auth.sessions/auth.refresh_tokens. Die id landet als session_id im
-- Access-Token und wird von nutzer_sitzungen/meine_aktiven_geraete() genutzt.
create table if not exists auth.sitzungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  refresh_token_hash text not null unique,
  aal text not null default 'aal1' check (aal in ('aal1', 'aal2')),
  erstellt_am timestamptz not null default now(),
  zuletzt_erneuert_am timestamptz not null default now(),
  laeuft_ab_am timestamptz not null,
  beendet_am timestamptz,
  user_agent text
);
create index if not exists sitzungen_user_id on auth.sitzungen (user_id);

revoke all on all tables in schema auth from anon, authenticated;
grant all on all tables in schema auth to service_role;

create or replace function auth.jwt() returns jsonb
  language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
  language sql stable
as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;

create or replace function auth.email() returns text
  language sql stable
as $$
  select nullif(auth.jwt() ->> 'email', '')
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role(), auth.email() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage (nur Metadaten; die Dateien liegen im Dateisystem des Servers)
-- ---------------------------------------------------------------------------

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

grant select on storage.buckets to anon, authenticated;
grant all on storage.buckets to service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant all on storage.objects to service_role;

-- Gleiche Semantik wie Supabase: Ordnerbestandteile des Pfads ohne Dateinamen.
create or replace function storage.foldername(name text) returns text[]
  language plpgsql immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text) returns text
  language plpgsql immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end
$$;

create or replace function storage.extension(name text) returns text
  language plpgsql immutable
as $$
declare
  _parts text[];
  _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end
$$;

grant execute on function storage.foldername(text), storage.filename(text), storage.extension(text)
  to anon, authenticated, service_role;
