-- Statusvorlagen: konfigurierbare, farbige Statuswerte (z. B. je Gewerk),
-- als wiederverwendbare Vorlage anlegbar und einem Plan zuweisbar. Pins auf
-- einem Plan mit zugewiesener Vorlage waehlen ihren Status aus deren Werten
-- statt aus dem festen offen/in_bearbeitung/erledigt.

create table public.statusvorlagen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

alter table public.statusvorlagen enable row level security;

create policy "statusvorlagen: eingeloggte Nutzer voller Zugriff"
  on public.statusvorlagen for all
  to authenticated
  using (true)
  with check (true);

create table public.statusvorlage_werte (
  id uuid primary key default gen_random_uuid(),
  statusvorlage_id uuid not null references public.statusvorlagen(id) on delete cascade,
  titel text not null,
  farbe text not null default '#6b7280',
  reihenfolge integer not null default 0,
  ist_standard boolean not null default false,
  erstellt_am timestamptz not null default now()
);

alter table public.statusvorlage_werte enable row level security;

create policy "statusvorlage_werte: eingeloggte Nutzer voller Zugriff"
  on public.statusvorlage_werte for all
  to authenticated
  using (true)
  with check (true);

alter table public.plaene
  add column statusvorlage_id uuid references public.statusvorlagen(id) on delete set null;

alter table public.maengel
  add column status_wert_id uuid references public.statusvorlage_werte(id) on delete set null;
