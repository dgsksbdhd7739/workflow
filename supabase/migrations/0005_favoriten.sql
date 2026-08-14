-- Favoriten: Projekte (Baustellen) koennen von jedem Nutzer individuell
-- favorisiert werden. Anders als die uebrigen Tabellen ist das eine
-- rein persoenliche Zuordnung, daher darf jeder Nutzer nur seine eigenen
-- Favoriten sehen und verwalten.

create table public.favoriten (
  user_id uuid not null references public.profiles(id) on delete cascade,
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  primary key (user_id, baustelle_id)
);

alter table public.favoriten enable row level security;

create policy "favoriten: nur eigene sehen"
  on public.favoriten for select
  to authenticated
  using (auth.uid() = user_id);

create policy "favoriten: nur eigene anlegen"
  on public.favoriten for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "favoriten: nur eigene loeschen"
  on public.favoriten for delete
  to authenticated
  using (auth.uid() = user_id);
