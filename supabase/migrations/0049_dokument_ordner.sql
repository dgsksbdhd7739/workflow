-- Ordnerstruktur fuer Projektdokumente (PlanRadar-Vergleich 2026-10-01,
-- Punkt 2: DMS zeigt Dokumente in verschachtelten Ordnern je Ort/Gebaeude).
-- Bei uns als freie, beliebig verschachtelbare Ordner je Projekt statt an
-- Plaene/Orte gekoppelt -- das passt besser zu unserem Datenmodell, in dem
-- Dokumente bereits ueber aufgabe_id an einzelne Markierungen haengen
-- koennen. Zusaetzlich eine Dateigroessen-Spalte, analog zu PlanRadars
-- "Groesse"-Spalte in der DMS-Tabelle.

create table public.dokument_ordner (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  parent_id uuid references public.dokument_ordner(id) on delete cascade,
  name text not null,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

create index dokument_ordner_projekt_idx on public.dokument_ordner (projekt_id);
create index dokument_ordner_parent_idx on public.dokument_ordner (parent_id);

alter table public.dokumente add column ordner_id uuid references public.dokument_ordner(id) on delete set null;
alter table public.dokumente add column groesse_bytes bigint;

alter table public.dokument_ordner enable row level security;

-- Gleiches Rechteschema wie dokumente (0021_dokumente.sql): lesen ueber
-- kunde_hat_zugriff, schreiben fuer admin/planer/techniker.
create policy "dokument_ordner: zugriffsberechtigte lesen"
  on public.dokument_ordner for select
  to authenticated
  using (public.kunde_hat_zugriff(projekt_id));

create policy "dokument_ordner: schreibberechtigte anlegen"
  on public.dokument_ordner for insert
  to authenticated
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.kunde_hat_zugriff(projekt_id));

create policy "dokument_ordner: schreibberechtigte aendern"
  on public.dokument_ordner for update
  to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.kunde_hat_zugriff(projekt_id));

create policy "dokument_ordner: schreibberechtigte loeschen"
  on public.dokument_ordner for delete
  to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.kunde_hat_zugriff(projekt_id));
