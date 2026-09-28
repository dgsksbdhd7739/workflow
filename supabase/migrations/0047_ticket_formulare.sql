-- Konfigurierbare Formular-Vorlagen fuer Tickets (PlanRadar-Vergleich,
-- TODO.md 2026-09-28, Punkt 6). Gleiches Grundmuster wie Statusvorlagen
-- (0006/0016/0033): eine firmenweite Vorlage mit geordneten Kind-Zeilen,
-- hier: konfigurierbare Zusatzfelder statt Fortschritts-Phasen.

create table public.ticket_formulare (
  id uuid primary key default gen_random_uuid(),
  unternehmen_id uuid not null references public.unternehmen(id) on delete cascade default public.current_unternehmen_id(),
  name text not null,
  ist_standard boolean not null default false,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

create index ticket_formulare_unternehmen_idx on public.ticket_formulare (unternehmen_id);

create table public.ticket_formular_felder (
  id uuid primary key default gen_random_uuid(),
  formular_id uuid not null references public.ticket_formulare(id) on delete cascade,
  titel text not null,
  feldtyp text not null default 'text' check (feldtyp in ('text', 'zahl', 'datum', 'checkbox', 'auswahl')),
  pflichtfeld boolean not null default false,
  optionen text[],
  reihenfolge integer not null default 0,
  erstellt_am timestamptz not null default now()
);

create index ticket_formular_felder_formular_idx on public.ticket_formular_felder (formular_id);

alter table public.aufgabe_tickets add column formular_id uuid references public.ticket_formulare(id) on delete set null;

create table public.aufgabe_ticket_feldwerte (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.aufgabe_tickets(id) on delete cascade,
  feld_id uuid not null references public.ticket_formular_felder(id) on delete cascade,
  wert text,
  unique (ticket_id, feld_id)
);

create index aufgabe_ticket_feldwerte_ticket_idx on public.aufgabe_ticket_feldwerte (ticket_id);

alter table public.ticket_formulare enable row level security;
alter table public.ticket_formular_felder enable row level security;
alter table public.aufgabe_ticket_feldwerte enable row level security;

-- ticket_formulare: lesen alle im Unternehmen, verwalten nur admin/planer.
create policy "ticket_formulare: eigenes unternehmen lesen"
  on public.ticket_formulare for select
  to authenticated
  using (unternehmen_id = public.current_unternehmen_id());

create policy "ticket_formulare: admin/planer anlegen"
  on public.ticket_formulare for insert
  to authenticated
  with check (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

create policy "ticket_formulare: admin/planer aendern"
  on public.ticket_formulare for update
  to authenticated
  using (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id())
  with check (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

create policy "ticket_formulare: admin/planer loeschen"
  on public.ticket_formulare for delete
  to authenticated
  using (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

-- ticket_formular_felder: Sichtbarkeit/Rechte ueber die zugehoerige Vorlage.
create policy "ticket_formular_felder: eigenes unternehmen lesen"
  on public.ticket_formular_felder for select
  to authenticated
  using (
    exists (
      select 1 from public.ticket_formulare v
      where v.id = ticket_formular_felder.formular_id and v.unternehmen_id = public.current_unternehmen_id()
    )
  );

create policy "ticket_formular_felder: admin/planer anlegen"
  on public.ticket_formular_felder for insert
  to authenticated
  with check (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.ticket_formulare v
      where v.id = ticket_formular_felder.formular_id and v.unternehmen_id = public.current_unternehmen_id()
    )
  );

create policy "ticket_formular_felder: admin/planer aendern"
  on public.ticket_formular_felder for update
  to authenticated
  using (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.ticket_formulare v
      where v.id = ticket_formular_felder.formular_id and v.unternehmen_id = public.current_unternehmen_id()
    )
  )
  with check (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.ticket_formulare v
      where v.id = ticket_formular_felder.formular_id and v.unternehmen_id = public.current_unternehmen_id()
    )
  );

create policy "ticket_formular_felder: admin/planer loeschen"
  on public.ticket_formular_felder for delete
  to authenticated
  using (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.ticket_formulare v
      where v.id = ticket_formular_felder.formular_id and v.unternehmen_id = public.current_unternehmen_id()
    )
  );

-- aufgabe_ticket_feldwerte: Sichtbarkeit/Rechte wie das zugehoerige Ticket
-- (identisch zum Muster von aufgabe_ticket_fotos aus 0040).
create policy "aufgabe_ticket_feldwerte: zugriffsberechtigte lesen"
  on public.aufgabe_ticket_feldwerte for select
  to authenticated
  using (
    exists (
      select 1 from public.aufgabe_tickets t
      join public.aufgaben a on a.id = t.aufgabe_id
      where t.id = aufgabe_ticket_feldwerte.ticket_id and public.kunde_hat_zugriff(a.projekt_id)
    )
  );

create policy "aufgabe_ticket_feldwerte: ersteller anlegen"
  on public.aufgabe_ticket_feldwerte for insert
  to authenticated
  with check (
    public.current_role() in ('admin', 'planer', 'kunde')
    and exists (
      select 1 from public.aufgabe_tickets t
      join public.aufgaben a on a.id = t.aufgabe_id
      where t.id = aufgabe_ticket_feldwerte.ticket_id and public.kunde_hat_zugriff(a.projekt_id)
    )
  );
