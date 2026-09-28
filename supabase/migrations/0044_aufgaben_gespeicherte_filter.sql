-- Gespeicherte, benannte Filter fuer die Aufgaben-Liste (PlanRadar-Vergleich,
-- TODO.md 2026-09-28, Punkt 3). Rein privat je Nutzer -- kein Team-weites
-- Teilen vorgesehen, analog dazu, dass sonst nichts in der App ausser
-- Statusvorlagen firmenweit geteilte Konfiguration ist.

create table public.aufgaben_filter (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  name text not null,
  filter jsonb not null,
  erstellt_am timestamptz not null default now()
);

create index aufgaben_filter_user_projekt_idx on public.aufgaben_filter (user_id, projekt_id);

alter table public.aufgaben_filter enable row level security;

create policy "aufgaben_filter: eigene lesen"
  on public.aufgaben_filter for select
  to authenticated
  using (user_id = auth.uid());

create policy "aufgaben_filter: eigene anlegen"
  on public.aufgaben_filter for insert
  to authenticated
  with check (user_id = auth.uid() and public.projekt_im_eigenen_unternehmen(projekt_id));

create policy "aufgaben_filter: eigene loeschen"
  on public.aufgaben_filter for delete
  to authenticated
  using (user_id = auth.uid());
