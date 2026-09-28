-- Fix: "infinite recursion detected in policy for relation aufgabe_tickets"
-- (42P17). Die Policy "aufgabe_tickets: cc-empfaenger lesen" aus 0042 fragte
-- aufgabe_ticket_empfaenger per Inline-Subquery ab; dessen eigene Select-
-- Policy fragt wiederum aufgabe_tickets ab -- ein Zirkel, da beide Subqueries
-- als aktueller Nutzer (nicht als Definer) laufen und damit jeweils die volle
-- RLS der anderen Tabelle erneut ausloesen. Wie bei den bestehenden Helfern
-- (current_role(), kunde_hat_zugriff() usw.) loest eine security-definer-
-- Funktion das auf: sie liest aufgabe_ticket_empfaenger als Funktionseigner
-- und damit unter Umgehung von dessen RLS, wodurch der Zirkel nicht mehr
-- entsteht.

create or replace function public.ist_ticket_cc_empfaenger(p_ticket_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.aufgabe_ticket_empfaenger e
    where e.ticket_id = p_ticket_id and e.user_id = auth.uid()
  )
$$;

drop policy if exists "aufgabe_tickets: cc-empfaenger lesen" on public.aufgabe_tickets;
create policy "aufgabe_tickets: cc-empfaenger lesen"
  on public.aufgabe_tickets for select
  to authenticated
  using (public.ist_ticket_cc_empfaenger(id));
