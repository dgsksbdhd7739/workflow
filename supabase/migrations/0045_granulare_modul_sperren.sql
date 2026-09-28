-- Granulare Modul-Zugriffssteuerung pro Nutzer (PlanRadar-Vergleich,
-- TODO.md 2026-09-28, Punkt 7): admin/planer koennen einem einzelnen Nutzer
-- den Zugriff auf ein bestimmtes Modul entziehen, unabhaengig von dessen
-- Rolle -- z. B. einem Techniker den Zugriff auf "Material" sperren, obwohl
-- Techniker das Modul grundsaetzlich sehen duerfen. Als Deny-Liste umgesetzt
-- (Zeile vorhanden = gesperrt), analog zum bestehenden Muster von
-- profiles.deaktiviert (Override on top of der Rolle, nicht Ersatz dafuer).

create table public.nutzer_modul_sperren (
  user_id uuid not null references public.profiles(id) on delete cascade,
  modul text not null check (modul in ('material', 'dokumente', 'tagesberichte', 'termine')),
  gesperrt_von uuid not null references public.profiles(id),
  gesperrt_am timestamptz not null default now(),
  primary key (user_id, modul)
);

alter table public.nutzer_modul_sperren enable row level security;

-- Lesen: das eigene Profil (fuer die UI-Navigation/Seitenschutz) oder admin/
-- planer fuer alle im eigenen Unternehmen (fuer die Verwaltungsoberflaeche).
create policy "nutzer_modul_sperren: eigene oder admin/planer lesen"
  on public.nutzer_modul_sperren for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      public.current_role() in ('admin', 'planer')
      and exists (
        select 1 from public.profiles p
        where p.id = nutzer_modul_sperren.user_id and p.unternehmen_id = public.current_unternehmen_id()
      )
    )
  );

create policy "nutzer_modul_sperren: admin/planer setzen"
  on public.nutzer_modul_sperren for insert
  to authenticated
  with check (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.profiles p
      where p.id = nutzer_modul_sperren.user_id and p.unternehmen_id = public.current_unternehmen_id()
    )
  );

create policy "nutzer_modul_sperren: admin/planer aufheben"
  on public.nutzer_modul_sperren for delete
  to authenticated
  using (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.profiles p
      where p.id = nutzer_modul_sperren.user_id and p.unternehmen_id = public.current_unternehmen_id()
    )
  );

-- security definer, damit RLS-Policies anderer Tabellen diese Tabelle lesen
-- koennen, ohne selbst deren (hier: nutzer-eigene) Sichtbarkeitsregeln zu
-- durchlaufen -- gleiches Muster wie public.current_role()/kunde_hat_zugriff().
create or replace function public.hat_modul_zugriff(p_modul text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.nutzer_modul_sperren
    where user_id = auth.uid() and modul = p_modul
  )
$$;

-- aufgabe_material ("Material")
drop policy if exists "mangel_material: zugriffsberechtigte lesen" on public.aufgabe_material;
create policy "mangel_material: zugriffsberechtigte lesen"
  on public.aufgabe_material for select
  to authenticated
  using (
    exists (select 1 from public.aufgaben m where m.id = aufgabe_material.aufgabe_id and public.kunde_hat_zugriff(m.projekt_id))
    and public.hat_modul_zugriff('material')
  );

drop policy if exists "mangel_material: admin/planer anlegen" on public.aufgabe_material;
create policy "mangel_material: admin/planer anlegen"
  on public.aufgabe_material for insert
  to authenticated
  with check (
    public.current_role() = any (array['admin', 'planer'])
    and aufgabe_im_eigenen_unternehmen(aufgabe_id)
    and public.hat_modul_zugriff('material')
  );

drop policy if exists "mangel_material: admin/planer/techniker aendern" on public.aufgabe_material;
create policy "mangel_material: admin/planer/techniker aendern"
  on public.aufgabe_material for update
  to authenticated
  using (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and aufgabe_im_eigenen_unternehmen(aufgabe_id)
    and public.hat_modul_zugriff('material')
  )
  with check (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and aufgabe_im_eigenen_unternehmen(aufgabe_id)
    and public.hat_modul_zugriff('material')
  );

drop policy if exists "mangel_material: admin/planer loeschen" on public.aufgabe_material;
create policy "mangel_material: admin/planer loeschen"
  on public.aufgabe_material for delete
  to authenticated
  using (
    public.current_role() = any (array['admin', 'planer'])
    and aufgabe_im_eigenen_unternehmen(aufgabe_id)
    and public.hat_modul_zugriff('material')
  );

-- dokumente ("Dokumente")
drop policy if exists "dokumente: zugriffsberechtigte lesen" on public.dokumente;
create policy "dokumente: zugriffsberechtigte lesen"
  on public.dokumente for select
  to authenticated
  using (kunde_hat_zugriff(projekt_id) and public.hat_modul_zugriff('dokumente'));

drop policy if exists "dokumente: schreibberechtigte anlegen" on public.dokumente;
create policy "dokumente: schreibberechtigte anlegen"
  on public.dokumente for insert
  to authenticated
  with check (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('dokumente')
  );

drop policy if exists "dokumente: schreibberechtigte aendern" on public.dokumente;
create policy "dokumente: schreibberechtigte aendern"
  on public.dokumente for update
  to authenticated
  using (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('dokumente')
  )
  with check (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('dokumente')
  );

drop policy if exists "dokumente: schreibberechtigte loeschen" on public.dokumente;
create policy "dokumente: schreibberechtigte loeschen"
  on public.dokumente for delete
  to authenticated
  using (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('dokumente')
  );

-- tagesberichte ("Tagesberichte")
drop policy if exists "tagesberichte: zugriffsberechtigte lesen" on public.tagesberichte;
create policy "tagesberichte: zugriffsberechtigte lesen"
  on public.tagesberichte for select
  to authenticated
  using (kunde_hat_zugriff(projekt_id) and public.hat_modul_zugriff('tagesberichte'));

drop policy if exists "tagesberichte: schreibberechtigte anlegen" on public.tagesberichte;
create policy "tagesberichte: schreibberechtigte anlegen"
  on public.tagesberichte for insert
  to authenticated
  with check (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('tagesberichte')
  );

drop policy if exists "tagesberichte: schreibberechtigte aendern" on public.tagesberichte;
create policy "tagesberichte: schreibberechtigte aendern"
  on public.tagesberichte for update
  to authenticated
  using (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('tagesberichte')
  )
  with check (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('tagesberichte')
  );

drop policy if exists "tagesberichte: schreibberechtigte loeschen" on public.tagesberichte;
create policy "tagesberichte: schreibberechtigte loeschen"
  on public.tagesberichte for delete
  to authenticated
  using (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('tagesberichte')
  );

-- termine ("Termine")
drop policy if exists "termine: zugriffsberechtigte lesen" on public.termine;
create policy "termine: zugriffsberechtigte lesen"
  on public.termine for select
  to authenticated
  using (kunde_hat_zugriff(projekt_id) and public.hat_modul_zugriff('termine'));

drop policy if exists "termine: schreibberechtigte anlegen" on public.termine;
create policy "termine: schreibberechtigte anlegen"
  on public.termine for insert
  to authenticated
  with check (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('termine')
  );

drop policy if exists "termine: schreibberechtigte aendern" on public.termine;
create policy "termine: schreibberechtigte aendern"
  on public.termine for update
  to authenticated
  using (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('termine')
  )
  with check (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('termine')
  );

drop policy if exists "termine: schreibberechtigte loeschen" on public.termine;
create policy "termine: schreibberechtigte loeschen"
  on public.termine for delete
  to authenticated
  using (
    public.current_role() = any (array['admin', 'planer', 'techniker'])
    and projekt_im_eigenen_unternehmen(projekt_id)
    and public.hat_modul_zugriff('termine')
  );
