-- Kalkulation (Leistungspositionen) und Terminplanung (Meilensteine)

-- Leistungen ----------------------------------------------------------------

create table public.leistungen (
  id uuid primary key default gen_random_uuid(),
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  position_nr integer not null default 0,
  bezeichnung text not null,
  menge numeric not null default 1,
  einheit text not null default 'Stk',
  einzelpreis numeric not null default 0,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

alter table public.leistungen enable row level security;

create policy "leistungen: eingeloggte Nutzer voller Zugriff"
  on public.leistungen for all
  to authenticated
  using (true)
  with check (true);

-- Termine / Meilensteine -----------------------------------------------------

create table public.termine (
  id uuid primary key default gen_random_uuid(),
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  titel text not null,
  start_datum date not null,
  end_datum date not null,
  status text not null default 'geplant' check (status in ('geplant', 'laufend', 'abgeschlossen', 'verzoegert')),
  vorgaenger_id uuid references public.termine(id) on delete set null,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now(),
  check (end_datum >= start_datum)
);

alter table public.termine enable row level security;

create policy "termine: eingeloggte Nutzer voller Zugriff"
  on public.termine for all
  to authenticated
  using (true)
  with check (true);
