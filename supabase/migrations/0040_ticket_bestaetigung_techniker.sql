-- Techniker sollen ein Ticket nun selbst als erledigt markieren koennen --
-- aber nur ueber eine Bestaetigung mit Kommentar und mindestens einem Foto
-- (Nachweis der Behebung). Admin/Planer behalten ihre bisherige Moeglichkeit,
-- ein Ticket ohne Nachweis abzuschliessen/wieder zu oeffnen (0038).

alter table public.aufgabe_tickets add column bestaetigung_kommentar text;

create table public.aufgabe_ticket_fotos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.aufgabe_tickets(id) on delete cascade,
  foto_pfad text not null,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

create index aufgabe_ticket_fotos_ticket_idx on public.aufgabe_ticket_fotos (ticket_id);

alter table public.aufgabe_ticket_fotos enable row level security;

-- Lesen: gleiche Sichtbarkeit wie das zugehoerige Ticket/die Aufgabe (auch
-- der Kunde soll den Nachweis sehen koennen, da er das Ticket gemeldet hat).
create policy "aufgabe_ticket_fotos: zugriffsberechtigte lesen"
  on public.aufgabe_ticket_fotos for select
  to authenticated
  using (
    exists (
      select 1 from public.aufgabe_tickets t
      join public.aufgaben a on a.id = t.aufgabe_id
      where t.id = aufgabe_ticket_fotos.ticket_id and public.kunde_hat_zugriff(a.projekt_id)
    )
  );

-- Hochladen: admin/planer/techniker, jeweils nur fuer Tickets ihrer Aufgaben.
create policy "aufgabe_ticket_fotos: admin/planer/techniker hochladen"
  on public.aufgabe_ticket_fotos for insert
  to authenticated
  with check (
    public.current_role() in ('admin', 'planer', 'techniker')
    and exists (
      select 1 from public.aufgabe_tickets t
      join public.aufgaben a on a.id = t.aufgabe_id
      where t.id = aufgabe_ticket_fotos.ticket_id and public.kunde_hat_zugriff(a.projekt_id)
    )
  );

-- Loeschen: nur admin/planer (z. B. versehentlich falsches Foto).
create policy "aufgabe_ticket_fotos: admin/planer loeschen"
  on public.aufgabe_ticket_fotos for delete
  to authenticated
  using (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.aufgabe_tickets t
      where t.id = aufgabe_ticket_fotos.ticket_id and public.aufgabe_im_eigenen_unternehmen(t.aufgabe_id)
    )
  );

-- Techniker duerfen ein offenes Ticket ausschliesslich mit ausgefuelltem
-- Bestaetigungskommentar auf "erledigt" setzen -- kein "wieder oeffnen",
-- das bleibt admin/planer vorbehalten (bestehende Policy aus 0038).
create policy "aufgabe_tickets: techniker mit bestaetigung abschliessen"
  on public.aufgabe_tickets for update
  to authenticated
  using (
    public.current_role() = 'techniker'
    and public.aufgabe_im_eigenen_unternehmen(aufgabe_id)
    and status = 'offen'
  )
  with check (
    public.current_role() = 'techniker'
    and public.aufgabe_im_eigenen_unternehmen(aufgabe_id)
    and status = 'erledigt'
    and bestaetigung_kommentar is not null
    and length(trim(bestaetigung_kommentar)) > 0
  );

-- mangel-fotos-Bucket: neuen Ordner "tickets/<aufgabe_id>/..." erlauben,
-- gleiches Muster wie "kommentare/<aufgabe_id>/...".
create or replace function public.aufgabe_foto_pfad_erlaubt(p_pfad text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  teile text[];
begin
  teile := storage.foldername(p_pfad);
  if teile is null or array_length(teile, 1) is null then
    return false;
  end if;
  if teile[1] in ('zeiterfassung', 'kommentare', 'tickets') then
    if array_length(teile, 1) < 2 then
      return false;
    end if;
    return public.aufgabe_im_eigenen_unternehmen(teile[2]::uuid);
  end if;
  return public.projekt_im_eigenen_unternehmen(teile[1]::uuid);
exception
  when invalid_text_representation then
    return false;
end;
$$;
