-- Jeder Tagesbericht bekommt eine feste Momentaufnahme aller Aufgaben
-- (Tueren) der Baustelle mit ihrem Stand zum Zeitpunkt der Erstellung.
-- Bewusst eine eigene Tabelle statt live aus "maengel" zu lesen: der
-- Tagesbericht ist ein historisches Dokument, der Stand von damals darf
-- sich nicht rueckwirkend aendern, wenn eine Aufgabe spaeter weiterlaeuft.

create table public.tagesbericht_tueren (
  id uuid primary key default gen_random_uuid(),
  tagesbericht_id uuid not null references public.tagesberichte(id) on delete cascade,
  mangel_id uuid references public.maengel(id) on delete set null,
  titel text not null,
  stand text not null,
  reihenfolge integer not null default 0,
  erstellt_am timestamptz not null default now()
);

create index tagesbericht_tueren_bericht_idx on public.tagesbericht_tueren (tagesbericht_id);

alter table public.tagesbericht_tueren enable row level security;

create policy "tagesbericht_tueren: zugriffsberechtigte lesen"
  on public.tagesbericht_tueren for select
  to authenticated
  using (
    exists (
      select 1 from public.tagesberichte t
      where t.id = tagesbericht_tueren.tagesbericht_id
        and public.kunde_hat_zugriff(t.baustelle_id)
    )
  );

create policy "tagesbericht_tueren: nicht-kunden anlegen"
  on public.tagesbericht_tueren for insert
  to authenticated
  with check (
    public.current_role() <> 'kunde'
    and exists (
      select 1 from public.tagesberichte t
      where t.id = tagesbericht_tueren.tagesbericht_id
        and public.kunde_hat_zugriff(t.baustelle_id)
    )
  );
