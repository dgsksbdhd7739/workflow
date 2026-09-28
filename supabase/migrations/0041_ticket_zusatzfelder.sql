-- Ticket-Zusatzfelder (angelehnt an PlanRadar-Vergleich, TODO.md 2026-09-28):
-- "Erledigen bis" (Faelligkeitsdatum), "Nachfrist" (Kulanzfrist danach, bevor
-- eskaliert wird) und "Ist gesperrt" (admin/planer koennen ein Ticket gegen
-- weitere Aenderungen fixieren, z. B. nach einer abgeschlossenen Pruefung).

alter table public.aufgabe_tickets
  add column erledigen_bis date,
  add column nachfrist date,
  add column ist_gesperrt boolean not null default false;

alter table public.aufgabe_tickets
  add constraint aufgabe_tickets_nachfrist_nach_faelligkeit
    check (nachfrist is null or erledigen_bis is null or nachfrist >= erledigen_bis);

-- Nur admin/planer duerfen sperren/entsperren -- ergaenzt die bestehende
-- Update-Policy aus 0038 um die neuen Spalten (keine Rechteaenderung noetig,
-- admin/planer duerfen ohnehin schon alles an einem Ticket aendern).

-- Techniker duerfen ein gesperrtes Ticket nicht mehr bestaetigen/abschliessen
-- -- die bestehende Policy aus 0040 wird um "not ist_gesperrt" ergaenzt.
drop policy if exists "aufgabe_tickets: techniker mit bestaetigung abschliessen" on public.aufgabe_tickets;
create policy "aufgabe_tickets: techniker mit bestaetigung abschliessen"
  on public.aufgabe_tickets for update
  to authenticated
  using (
    public.current_role() = 'techniker'
    and public.aufgabe_im_eigenen_unternehmen(aufgabe_id)
    and status = 'offen'
    and not ist_gesperrt
  )
  with check (
    public.current_role() = 'techniker'
    and public.aufgabe_im_eigenen_unternehmen(aufgabe_id)
    and status = 'erledigt'
    and not ist_gesperrt
    and bestaetigung_kommentar is not null
    and length(trim(bestaetigung_kommentar)) > 0
  );
