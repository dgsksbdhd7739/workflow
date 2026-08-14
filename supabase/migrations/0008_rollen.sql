-- Rollenbasierte Berechtigungen: admin, planer, techniker, kunde.
-- Ersetzt das bisherige "jeder sieht/bearbeitet alles"-Modell durch
-- rollenabhaengige Schreibrechte (RLS). Lesezugriff bleibt fuer die
-- meisten Tabellen offen fuer alle eingeloggten Nutzer; Kalkulation und
-- Zeiterfassung sind fuer Kunden komplett gesperrt.

-- Bestehende Rollenwerte migrieren, bevor der Constraint verschaerft wird.
alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles
set role = case role
  when 'polier' then 'planer'
  when 'arbeiter' then 'techniker'
  else role
end;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'planer', 'techniker', 'kunde'));

alter table public.profiles alter column role set default 'techniker';

-- Hilfsfunktion: Rolle des aktuell eingeloggten Nutzers.
create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Nur Admins duerfen die Rolle eines Nutzers aendern (auch nicht der
-- Nutzer selbst ueber die "eigenes Profil aktualisieren"-Policy).
create or replace function public.protect_role_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and public.current_role() is distinct from 'admin' then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_role_before_update on public.profiles;
create trigger protect_role_before_update
  before update on public.profiles
  for each row execute procedure public.protect_role_column();

create policy "profiles: admin kann alle aktualisieren"
  on public.profiles for update
  to authenticated
  using (public.current_role() = 'admin');

-- Baustellen: alle lesen, nur admin/planer legen an/aendern/loeschen ----

drop policy if exists "baustellen: eingeloggte Nutzer voller Zugriff" on public.baustellen;

create policy "baustellen: alle lesen" on public.baustellen for select to authenticated using (true);
create policy "baustellen: admin/planer anlegen" on public.baustellen for insert to authenticated with check (public.current_role() in ('admin', 'planer'));
create policy "baustellen: admin/planer aendern" on public.baustellen for update to authenticated using (public.current_role() in ('admin', 'planer'));
create policy "baustellen: admin/planer loeschen" on public.baustellen for delete to authenticated using (public.current_role() in ('admin', 'planer'));

-- Maengel, Plaene, Tagesberichte, Termine, Baustufen, Kommentare: alle
-- lesen (auch Kunden), schreiben nur admin/planer/techniker -------------

drop policy if exists "maengel: eingeloggte Nutzer voller Zugriff" on public.maengel;
create policy "maengel: alle lesen" on public.maengel for select to authenticated using (true);
create policy "maengel: schreibberechtigte anlegen" on public.maengel for insert to authenticated with check (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "maengel: schreibberechtigte aendern" on public.maengel for update to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "maengel: schreibberechtigte loeschen" on public.maengel for delete to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));

drop policy if exists "plaene: eingeloggte Nutzer voller Zugriff" on public.plaene;
create policy "plaene: alle lesen" on public.plaene for select to authenticated using (true);
create policy "plaene: schreibberechtigte anlegen" on public.plaene for insert to authenticated with check (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "plaene: schreibberechtigte aendern" on public.plaene for update to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "plaene: schreibberechtigte loeschen" on public.plaene for delete to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));

drop policy if exists "tagesberichte: eingeloggte Nutzer voller Zugriff" on public.tagesberichte;
create policy "tagesberichte: alle lesen" on public.tagesberichte for select to authenticated using (true);
create policy "tagesberichte: schreibberechtigte anlegen" on public.tagesberichte for insert to authenticated with check (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "tagesberichte: schreibberechtigte aendern" on public.tagesberichte for update to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "tagesberichte: schreibberechtigte loeschen" on public.tagesberichte for delete to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));

drop policy if exists "termine: eingeloggte Nutzer voller Zugriff" on public.termine;
create policy "termine: alle lesen" on public.termine for select to authenticated using (true);
create policy "termine: schreibberechtigte anlegen" on public.termine for insert to authenticated with check (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "termine: schreibberechtigte aendern" on public.termine for update to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "termine: schreibberechtigte loeschen" on public.termine for delete to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));

drop policy if exists "mangel_phasen: eingeloggte Nutzer voller Zugriff" on public.mangel_phasen;
create policy "mangel_phasen: alle lesen" on public.mangel_phasen for select to authenticated using (true);
create policy "mangel_phasen: schreibberechtigte anlegen" on public.mangel_phasen for insert to authenticated with check (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "mangel_phasen: schreibberechtigte aendern" on public.mangel_phasen for update to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "mangel_phasen: schreibberechtigte loeschen" on public.mangel_phasen for delete to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));

drop policy if exists "mangel_kommentare: eingeloggte Nutzer voller Zugriff" on public.mangel_kommentare;
create policy "mangel_kommentare: alle lesen" on public.mangel_kommentare for select to authenticated using (true);
create policy "mangel_kommentare: schreibberechtigte anlegen" on public.mangel_kommentare for insert to authenticated with check (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "mangel_kommentare: schreibberechtigte aendern" on public.mangel_kommentare for update to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "mangel_kommentare: schreibberechtigte loeschen" on public.mangel_kommentare for delete to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));

-- Statusvorlagen: alle lesen (fuer Status-Anzeige/Auswahl), nur
-- admin/planer verwalten -----------------------------------------------

drop policy if exists "statusvorlagen: eingeloggte Nutzer voller Zugriff" on public.statusvorlagen;
create policy "statusvorlagen: alle lesen" on public.statusvorlagen for select to authenticated using (true);
create policy "statusvorlagen: admin/planer anlegen" on public.statusvorlagen for insert to authenticated with check (public.current_role() in ('admin', 'planer'));
create policy "statusvorlagen: admin/planer aendern" on public.statusvorlagen for update to authenticated using (public.current_role() in ('admin', 'planer'));
create policy "statusvorlagen: admin/planer loeschen" on public.statusvorlagen for delete to authenticated using (public.current_role() in ('admin', 'planer'));

drop policy if exists "statusvorlage_werte: eingeloggte Nutzer voller Zugriff" on public.statusvorlage_werte;
create policy "statusvorlage_werte: alle lesen" on public.statusvorlage_werte for select to authenticated using (true);
create policy "statusvorlage_werte: admin/planer anlegen" on public.statusvorlage_werte for insert to authenticated with check (public.current_role() in ('admin', 'planer'));
create policy "statusvorlage_werte: admin/planer aendern" on public.statusvorlage_werte for update to authenticated using (public.current_role() in ('admin', 'planer'));
create policy "statusvorlage_werte: admin/planer loeschen" on public.statusvorlage_werte for delete to authenticated using (public.current_role() in ('admin', 'planer'));

-- Kalkulation: komplett gesperrt fuer techniker/kunde --------------------

drop policy if exists "leistungen: eingeloggte Nutzer voller Zugriff" on public.leistungen;
create policy "leistungen: admin/planer lesen" on public.leistungen for select to authenticated using (public.current_role() in ('admin', 'planer'));
create policy "leistungen: admin/planer anlegen" on public.leistungen for insert to authenticated with check (public.current_role() in ('admin', 'planer'));
create policy "leistungen: admin/planer aendern" on public.leistungen for update to authenticated using (public.current_role() in ('admin', 'planer'));
create policy "leistungen: admin/planer loeschen" on public.leistungen for delete to authenticated using (public.current_role() in ('admin', 'planer'));

-- Zeiterfassung: komplett gesperrt fuer kunde ----------------------------

drop policy if exists "zeiterfassung: eingeloggte Nutzer voller Zugriff" on public.zeiterfassung;
create policy "zeiterfassung: schreibberechtigte lesen" on public.zeiterfassung for select to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "zeiterfassung: schreibberechtigte anlegen" on public.zeiterfassung for insert to authenticated with check (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "zeiterfassung: schreibberechtigte aendern" on public.zeiterfassung for update to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "zeiterfassung: schreibberechtigte loeschen" on public.zeiterfassung for delete to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
