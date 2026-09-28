-- CC-Empfaenger pro Ticket (PlanRadar-Vergleich, TODO.md 2026-09-28, Punkt 2):
-- zusaetzliche Personen, die ueber ein Ticket informiert werden/es einsehen
-- koennen sollen, unabhaengig von ihrer sonstigen Projekt-Zugriffsberechtigung
-- (z. B. ein Kunde, der dem Projekt sonst nicht zugewiesen ist).

create table public.aufgabe_ticket_empfaenger (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.aufgabe_tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hinzugefuegt_von uuid not null references public.profiles(id),
  hinzugefuegt_am timestamptz not null default now(),
  unique (ticket_id, user_id)
);

create index aufgabe_ticket_empfaenger_ticket_idx on public.aufgabe_ticket_empfaenger (ticket_id);

alter table public.aufgabe_ticket_empfaenger enable row level security;

-- Lesen: wie das zugehoerige Ticket (gleiche Sichtbarkeit ueber die Aufgabe).
create policy "aufgabe_ticket_empfaenger: zugriffsberechtigte lesen"
  on public.aufgabe_ticket_empfaenger for select
  to authenticated
  using (
    exists (
      select 1 from public.aufgabe_tickets t
      join public.aufgaben a on a.id = t.aufgabe_id
      where t.id = aufgabe_ticket_empfaenger.ticket_id and public.kunde_hat_zugriff(a.projekt_id)
    )
  );

-- Hinzufuegen/Entfernen: nur admin/planer (wie das Abschliessen von Tickets).
create policy "aufgabe_ticket_empfaenger: admin/planer hinzufuegen"
  on public.aufgabe_ticket_empfaenger for insert
  to authenticated
  with check (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.aufgabe_tickets t
      where t.id = aufgabe_ticket_empfaenger.ticket_id and public.aufgabe_im_eigenen_unternehmen(t.aufgabe_id)
    )
  );

create policy "aufgabe_ticket_empfaenger: admin/planer entfernen"
  on public.aufgabe_ticket_empfaenger for delete
  to authenticated
  using (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.aufgabe_tickets t
      where t.id = aufgabe_ticket_empfaenger.ticket_id and public.aufgabe_im_eigenen_unternehmen(t.aufgabe_id)
    )
  );

-- Ein CC-Empfaenger darf das Ticket sehen, auch wenn er sonst keinen Zugriff
-- auf das Projekt/die Aufgabe haette (z. B. ein nicht zugewiesener Kunde) --
-- ergaenzt die bestehende Lese-Policy aus 0038 (Policies werden ODER-verknuepft).
create policy "aufgabe_tickets: cc-empfaenger lesen"
  on public.aufgabe_tickets for select
  to authenticated
  using (
    exists (
      select 1 from public.aufgabe_ticket_empfaenger e
      where e.ticket_id = aufgabe_tickets.id and e.user_id = auth.uid()
    )
  );
