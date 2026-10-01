-- Erlaubt Plattform-Admins, jede Firma zu lesen und zu bearbeiten (Name,
-- Adresse, Kontakt, Logo, Nutzerlimit) -- nicht nur die eigene. Bisher
-- durfte laut 0020/0028 jeder Nutzer nur seine eigene Firma lesen/aendern
-- (id = current_unternehmen_id()); diese Policies bleiben unveraendert
-- bestehen, hier kommen zusaetzliche fuer Plattform-Admins hinzu (RLS-
-- Policies werden mit OR verknuepft).

create policy "unternehmen: plattform-admin liest alle"
  on public.unternehmen for select
  to authenticated
  using (public.ist_plattform_admin());

create policy "unternehmen: plattform-admin aktualisiert alle"
  on public.unternehmen for update
  to authenticated
  using (public.ist_plattform_admin())
  with check (public.ist_plattform_admin());

-- Logo-Upload fuer eine fremde Firma: der Pfad "<unternehmen_id>/..."
-- gehoert dann nicht der eigenen current_unternehmen_id() des
-- Plattform-Admins, daher muss unternehmen_ordner_erlaubt() hier explizit
-- per OR umgangen werden.
drop policy if exists "unternehmen-logos: admin/planer hochladen" on storage.objects;
drop policy if exists "unternehmen-logos: admin/planer aendern" on storage.objects;
drop policy if exists "unternehmen-logos: admin/planer loeschen" on storage.objects;

create policy "unternehmen-logos: admin/planer hochladen"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'unternehmen-logos'
    and public.current_role() in ('admin', 'planer')
    and (public.unternehmen_ordner_erlaubt(name) or public.ist_plattform_admin())
  );

create policy "unternehmen-logos: admin/planer aendern"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'unternehmen-logos'
    and public.current_role() in ('admin', 'planer')
    and (public.unternehmen_ordner_erlaubt(name) or public.ist_plattform_admin())
  );

create policy "unternehmen-logos: admin/planer loeschen"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'unternehmen-logos'
    and public.current_role() in ('admin', 'planer')
    and (public.unternehmen_ordner_erlaubt(name) or public.ist_plattform_admin())
  );
