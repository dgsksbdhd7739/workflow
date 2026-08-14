-- Mehrstufiger Fortschritt und Kommentarverlauf je Mangel/Aufgabe

create table public.mangel_phasen (
  id uuid primary key default gen_random_uuid(),
  mangel_id uuid not null references public.maengel(id) on delete cascade,
  titel text not null,
  reihenfolge integer not null default 0,
  status text not null default 'offen' check (status in ('offen', 'in_bearbeitung', 'erledigt')),
  notiz text,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

alter table public.mangel_phasen enable row level security;

create policy "mangel_phasen: eingeloggte Nutzer voller Zugriff"
  on public.mangel_phasen for all
  to authenticated
  using (true)
  with check (true);

create table public.mangel_kommentare (
  id uuid primary key default gen_random_uuid(),
  mangel_id uuid not null references public.maengel(id) on delete cascade,
  text text,
  foto_url text,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now(),
  check (text is not null or foto_url is not null)
);

alter table public.mangel_kommentare enable row level security;

create policy "mangel_kommentare: eingeloggte Nutzer voller Zugriff"
  on public.mangel_kommentare for all
  to authenticated
  using (true)
  with check (true);
