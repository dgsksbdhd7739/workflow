-- Tickets: Kunde, Admin und Planer koennen zu einer Aufgabe eine Mangel-/
-- Problemmeldung ("Ticket") erfassen. Anwendungsfall: der Kunde nimmt die
-- Arbeiten vor Ort ab und stellt einen Mangel fest -- das muss Planer und
-- Admin sichtbar gemeldet werden koennen, ohne dass der Kunde Zugriff auf
-- die internen Aufgabe-Kommentare (aufgabe_kommentare) braucht.
--
-- Techniker sind bewusst aussen vor: sie fuehren Arbeiten aus, melden aber
-- keine Kundenreklamationen. Nur admin/planer duerfen ein Ticket als
-- erledigt abschliessen (der Kunde meldet, entscheidet aber nicht selbst
-- ueber den Abschluss).

create table public.aufgabe_tickets (
  id uuid primary key default gen_random_uuid(),
  aufgabe_id uuid not null references public.aufgaben(id) on delete cascade,
  text text not null,
  status text not null default 'offen' check (status in ('offen', 'erledigt')),
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now(),
  erledigt_von uuid references public.profiles(id),
  erledigt_am timestamptz
);

create index aufgabe_tickets_aufgabe_idx on public.aufgabe_tickets (aufgabe_id);

alter table public.aufgabe_tickets enable row level security;

-- Lesen: gleiche Sichtbarkeit wie die zugehoerige Aufgabe selbst (eigenes
-- Unternehmen, Kunde nur bei zugewiesenem Projekt).
create policy "aufgabe_tickets: zugriffsberechtigte lesen"
  on public.aufgabe_tickets for select
  to authenticated
  using (
    exists (
      select 1 from public.aufgaben a
      where a.id = aufgabe_tickets.aufgabe_id and public.kunde_hat_zugriff(a.projekt_id)
    )
  );

-- Anlegen: admin/planer/kunde, jeweils nur fuer Aufgaben, auf die sie
-- Zugriff haben (Kunde also nur fuer ihm zugewiesene Projekte).
create policy "aufgabe_tickets: kunde/admin/planer anlegen"
  on public.aufgabe_tickets for insert
  to authenticated
  with check (
    public.current_role() in ('admin', 'planer', 'kunde')
    and exists (
      select 1 from public.aufgaben a
      where a.id = aufgabe_tickets.aufgabe_id and public.kunde_hat_zugriff(a.projekt_id)
    )
  );

-- Aendern (z. B. als erledigt markieren): nur admin/planer.
create policy "aufgabe_tickets: admin/planer aendern"
  on public.aufgabe_tickets for update
  to authenticated
  using (public.current_role() in ('admin', 'planer') and public.aufgabe_im_eigenen_unternehmen(aufgabe_id))
  with check (public.current_role() in ('admin', 'planer') and public.aufgabe_im_eigenen_unternehmen(aufgabe_id));

-- Loeschen: nur admin/planer (z. B. versehentlich angelegtes Ticket).
create policy "aufgabe_tickets: admin/planer loeschen"
  on public.aufgabe_tickets for delete
  to authenticated
  using (public.current_role() in ('admin', 'planer') and public.aufgabe_im_eigenen_unternehmen(aufgabe_id));
