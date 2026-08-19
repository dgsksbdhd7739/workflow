-- Mandantentrennung: bisher hatte "eingeloggter Nutzer" ueberall in etwa
-- "Nutzer meines Unternehmens" bedeutet, weil es nur ein Unternehmen gab.
-- Fuer eine kuenftige Veroeffentlichung an mehrere Firmen muss das sauber
-- getrennt werden. Betrifft zwei unabhaengige Luecken:
--
--  1. Provisionierung: handle_new_user() (Migration 0020) haengt JEDEN neuen
--     Account hart an das aelteste Unternehmen -- ein Admin von Firma B, der
--     ueber "Nutzer anlegen" einen Kollegen einlaedt, wuerde ihn unwissentlich
--     in Firma A landen lassen.
--  2. Datenzugriff: baustellen und alles, was daran haengt (maengel,
--     tagesberichte, zeiterfassung, plaene, dokumente, termine, ...) hatte
--     entweder "using (true)" (voller Zugriff fuer jeden eingeloggten Nutzer)
--     oder nur eine Rollen-Pruefung ganz ohne Unternehmensbezug. profiles war
--     ebenfalls unternehmensuebergreifend lesbar.
--
-- Wiederverwendet wird das bereits vorhandene Fundament aus Migration 0020:
-- unternehmen-Tabelle, profiles.unternehmen_id, current_unternehmen_id().

-- =============================================================================
-- 1. Provisionierung: neue Nutzer landen im Unternehmen des einladenden Admins
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  ziel_unternehmen_id uuid;
  standard_id uuid;
begin
  -- create-user (Edge-Function) uebergibt das Unternehmen des einladenden
  -- Admins explizit ueber user_metadata. Ohne diese Angabe (z. B. heutige
  -- Selbstregistrierung, falls es die je gibt) faellt es wie bisher auf das
  -- aelteste Unternehmen zurueck, statt den Insert scheitern zu lassen.
  ziel_unternehmen_id := (new.raw_user_meta_data ->> 'unternehmen_id')::uuid;
  if ziel_unternehmen_id is null or not exists (select 1 from public.unternehmen where id = ziel_unternehmen_id) then
    select id into standard_id from public.unternehmen order by erstellt_am limit 1;
    ziel_unternehmen_id := standard_id;
  end if;

  insert into public.profiles (id, full_name, unternehmen_id)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), ziel_unternehmen_id);
  return new;
end;
$$;

-- =============================================================================
-- 2. baustellen (Wurzel-Tabelle) und statusvorlagen (unternehmensweite
--    Vorlagen, bisher gar nicht an eine Baustelle gebunden) um
--    unternehmen_id erweitern. Bestehender Datenbestand gehoert komplett
--    dem bisher einzigen Unternehmen -- dieselbe Herleitung wie in 0020.
-- =============================================================================

alter table public.baustellen add column unternehmen_id uuid references public.unternehmen(id);
update public.baustellen set unternehmen_id = (select id from public.unternehmen order by erstellt_am limit 1) where unternehmen_id is null;
alter table public.baustellen alter column unternehmen_id set not null;
alter table public.baustellen alter column unternehmen_id set default public.current_unternehmen_id();
create index if not exists baustellen_unternehmen_idx on public.baustellen (unternehmen_id);

alter table public.statusvorlagen add column unternehmen_id uuid references public.unternehmen(id);
update public.statusvorlagen set unternehmen_id = (select id from public.unternehmen order by erstellt_am limit 1) where unternehmen_id is null;
alter table public.statusvorlagen alter column unternehmen_id set not null;
alter table public.statusvorlagen alter column unternehmen_id set default public.current_unternehmen_id();
create index if not exists statusvorlagen_unternehmen_idx on public.statusvorlagen (unternehmen_id);

-- =============================================================================
-- 3. Hilfsfunktionen: Unternehmenszugehoerigkeit ueber die jeweilige
--    Fremdschluessel-Kette zurueck zu baustellen/statusvorlagen aufloesen.
-- =============================================================================

create or replace function public.baustelle_im_eigenen_unternehmen(p_baustelle_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.baustellen b
    where b.id = p_baustelle_id and b.unternehmen_id = public.current_unternehmen_id()
  )
$$;

create or replace function public.mangel_im_eigenen_unternehmen(p_mangel_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.maengel m
    where m.id = p_mangel_id and public.baustelle_im_eigenen_unternehmen(m.baustelle_id)
  )
$$;

create or replace function public.tagesbericht_im_eigenen_unternehmen(p_tagesbericht_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tagesberichte t
    where t.id = p_tagesbericht_id and public.baustelle_im_eigenen_unternehmen(t.baustelle_id)
  )
$$;

-- kunde_hat_zugriff (Migration 0009) wird um die Unternehmensgrenze erweitert,
-- statt eine neue Funktion einzufuehren -- alle bestehenden Lese-Policies, die
-- sie bereits aufrufen (baustellen, maengel, plaene, tagesberichte, termine,
-- mangel_phasen, mangel_kommentare, dokumente, mangel_material,
-- tagesbericht_tueren, projekt_chat_nachrichten), werden dadurch automatisch
-- mit abgesichert, ohne selbst angefasst zu werden.
create or replace function public.kunde_hat_zugriff(p_baustelle_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.baustelle_im_eigenen_unternehmen(p_baustelle_id)
    and (
      public.current_role() is distinct from 'kunde'
      or exists (
        select 1 from public.baustelle_kunden bk
        where bk.baustelle_id = p_baustelle_id and bk.user_id = auth.uid()
      )
    )
$$;

-- =============================================================================
-- 4. profiles: Namen/E-Mails anderer Firmen waren bisher fuer jeden
--    eingeloggten Nutzer lesbar.
-- =============================================================================

drop policy if exists "profiles: alle eingeloggten Nutzer koennen lesen" on public.profiles;
create policy "profiles: eigenes Unternehmen lesen"
  on public.profiles for select
  to authenticated
  using (unternehmen_id = public.current_unternehmen_id());

-- =============================================================================
-- 5. baustellen: Schreibrechte (Migration 0008) waren rein rollenbasiert,
--    ohne jede Pruefung, welchem Unternehmen die Zeile gehoert.
-- =============================================================================

drop policy if exists "baustellen: admin/planer anlegen" on public.baustellen;
create policy "baustellen: admin/planer anlegen"
  on public.baustellen for insert
  to authenticated
  with check (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

drop policy if exists "baustellen: admin/planer aendern" on public.baustellen;
create policy "baustellen: admin/planer aendern"
  on public.baustellen for update
  to authenticated
  using (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id())
  with check (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

drop policy if exists "baustellen: admin/planer loeschen" on public.baustellen;
create policy "baustellen: admin/planer loeschen"
  on public.baustellen for delete
  to authenticated
  using (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

-- =============================================================================
-- 6. Tabellen mit direktem baustelle_id-Bezug, deren Schreibrechte bisher
--    rein rollenbasiert waren (maengel, plaene, tagesberichte, termine).
-- =============================================================================

drop policy if exists "maengel: schreibberechtigte anlegen" on public.maengel;
create policy "maengel: schreibberechtigte anlegen" on public.maengel for insert to authenticated
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "maengel: schreibberechtigte aendern" on public.maengel;
create policy "maengel: schreibberechtigte aendern" on public.maengel for update to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id))
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "maengel: schreibberechtigte loeschen" on public.maengel;
create policy "maengel: schreibberechtigte loeschen" on public.maengel for delete to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));

drop policy if exists "plaene: schreibberechtigte anlegen" on public.plaene;
create policy "plaene: schreibberechtigte anlegen" on public.plaene for insert to authenticated
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "plaene: schreibberechtigte aendern" on public.plaene;
create policy "plaene: schreibberechtigte aendern" on public.plaene for update to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id))
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "plaene: schreibberechtigte loeschen" on public.plaene;
create policy "plaene: schreibberechtigte loeschen" on public.plaene for delete to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));

drop policy if exists "tagesberichte: schreibberechtigte anlegen" on public.tagesberichte;
create policy "tagesberichte: schreibberechtigte anlegen" on public.tagesberichte for insert to authenticated
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "tagesberichte: schreibberechtigte aendern" on public.tagesberichte;
create policy "tagesberichte: schreibberechtigte aendern" on public.tagesberichte for update to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id))
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "tagesberichte: schreibberechtigte loeschen" on public.tagesberichte;
create policy "tagesberichte: schreibberechtigte loeschen" on public.tagesberichte for delete to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));

drop policy if exists "termine: schreibberechtigte anlegen" on public.termine;
create policy "termine: schreibberechtigte anlegen" on public.termine for insert to authenticated
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "termine: schreibberechtigte aendern" on public.termine;
create policy "termine: schreibberechtigte aendern" on public.termine for update to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id))
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "termine: schreibberechtigte loeschen" on public.termine;
create policy "termine: schreibberechtigte loeschen" on public.termine for delete to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));

drop policy if exists "leistungen: admin/planer lesen" on public.leistungen;
create policy "leistungen: admin/planer lesen" on public.leistungen for select to authenticated
  using (public.current_role() in ('admin', 'planer') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "leistungen: admin/planer anlegen" on public.leistungen;
create policy "leistungen: admin/planer anlegen" on public.leistungen for insert to authenticated
  with check (public.current_role() in ('admin', 'planer') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "leistungen: admin/planer aendern" on public.leistungen;
create policy "leistungen: admin/planer aendern" on public.leistungen for update to authenticated
  using (public.current_role() in ('admin', 'planer') and public.baustelle_im_eigenen_unternehmen(baustelle_id))
  with check (public.current_role() in ('admin', 'planer') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "leistungen: admin/planer loeschen" on public.leistungen;
create policy "leistungen: admin/planer loeschen" on public.leistungen for delete to authenticated
  using (public.current_role() in ('admin', 'planer') and public.baustelle_im_eigenen_unternehmen(baustelle_id));

drop policy if exists "zeiterfassung: schreibberechtigte lesen" on public.zeiterfassung;
create policy "zeiterfassung: schreibberechtigte lesen" on public.zeiterfassung for select to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "zeiterfassung: schreibberechtigte anlegen" on public.zeiterfassung;
create policy "zeiterfassung: schreibberechtigte anlegen" on public.zeiterfassung for insert to authenticated
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "zeiterfassung: schreibberechtigte aendern" on public.zeiterfassung;
create policy "zeiterfassung: schreibberechtigte aendern" on public.zeiterfassung for update to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id))
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "zeiterfassung: schreibberechtigte loeschen" on public.zeiterfassung;
create policy "zeiterfassung: schreibberechtigte loeschen" on public.zeiterfassung for delete to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));

drop policy if exists "dokumente: schreibberechtigte anlegen" on public.dokumente;
create policy "dokumente: schreibberechtigte anlegen" on public.dokumente for insert to authenticated
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "dokumente: schreibberechtigte aendern" on public.dokumente;
create policy "dokumente: schreibberechtigte aendern" on public.dokumente for update to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id))
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "dokumente: schreibberechtigte loeschen" on public.dokumente;
create policy "dokumente: schreibberechtigte loeschen" on public.dokumente for delete to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_im_eigenen_unternehmen(baustelle_id));

-- =============================================================================
-- 7. Tabellen mit mangel_id-Bezug (zwei Fremdschluessel-Sprnge bis baustellen).
-- =============================================================================

drop policy if exists "mangel_phasen: schreibberechtigte anlegen" on public.mangel_phasen;
create policy "mangel_phasen: schreibberechtigte anlegen" on public.mangel_phasen for insert to authenticated
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id));
drop policy if exists "mangel_phasen: schreibberechtigte aendern" on public.mangel_phasen;
create policy "mangel_phasen: schreibberechtigte aendern" on public.mangel_phasen for update to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id))
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id));
drop policy if exists "mangel_phasen: schreibberechtigte loeschen" on public.mangel_phasen;
create policy "mangel_phasen: schreibberechtigte loeschen" on public.mangel_phasen for delete to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id));

drop policy if exists "mangel_kommentare: schreibberechtigte anlegen" on public.mangel_kommentare;
create policy "mangel_kommentare: schreibberechtigte anlegen" on public.mangel_kommentare for insert to authenticated
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id));
drop policy if exists "mangel_kommentare: schreibberechtigte aendern" on public.mangel_kommentare;
create policy "mangel_kommentare: schreibberechtigte aendern" on public.mangel_kommentare for update to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id))
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id));
drop policy if exists "mangel_kommentare: schreibberechtigte loeschen" on public.mangel_kommentare;
create policy "mangel_kommentare: schreibberechtigte loeschen" on public.mangel_kommentare for delete to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id));

drop policy if exists "mangel_material: admin/planer anlegen" on public.mangel_material;
create policy "mangel_material: admin/planer anlegen" on public.mangel_material for insert to authenticated
  with check (public.current_role() in ('admin', 'planer') and public.mangel_im_eigenen_unternehmen(mangel_id));
drop policy if exists "mangel_material: admin/planer/techniker aendern" on public.mangel_material;
create policy "mangel_material: admin/planer/techniker aendern" on public.mangel_material for update to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id))
  with check (public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_im_eigenen_unternehmen(mangel_id));
drop policy if exists "mangel_material: admin/planer loeschen" on public.mangel_material;
create policy "mangel_material: admin/planer loeschen" on public.mangel_material for delete to authenticated
  using (public.current_role() in ('admin', 'planer') and public.mangel_im_eigenen_unternehmen(mangel_id));

-- =============================================================================
-- 8. tagesbericht_tueren: historischer Schnappschuss, nur lesen + anlegen.
-- =============================================================================

drop policy if exists "tagesbericht_tueren: nicht-kunden anlegen" on public.tagesbericht_tueren;
create policy "tagesbericht_tueren: nicht-kunden anlegen"
  on public.tagesbericht_tueren for insert
  to authenticated
  with check (
    public.current_role() <> 'kunde'
    and public.tagesbericht_im_eigenen_unternehmen(tagesbericht_id)
  );

-- =============================================================================
-- 9. baustelle_kunden: Kunden-Zuordnung war rein rollenbasiert -- ein Admin
--    haette (z. B. durch Erraten einer UUID) eine fremde Baustelle einem
--    eigenen Kunden zuweisen und ihm damit Lesezugriff verschaffen koennen.
-- =============================================================================

drop policy if exists "baustelle_kunden: admin/planer lesen" on public.baustelle_kunden;
create policy "baustelle_kunden: admin/planer lesen" on public.baustelle_kunden for select to authenticated
  using (public.current_role() in ('admin', 'planer') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "baustelle_kunden: admin/planer anlegen" on public.baustelle_kunden;
create policy "baustelle_kunden: admin/planer anlegen" on public.baustelle_kunden for insert to authenticated
  with check (public.current_role() in ('admin', 'planer') and public.baustelle_im_eigenen_unternehmen(baustelle_id));
drop policy if exists "baustelle_kunden: admin/planer loeschen" on public.baustelle_kunden;
create policy "baustelle_kunden: admin/planer loeschen" on public.baustelle_kunden for delete to authenticated
  using (public.current_role() in ('admin', 'planer') and public.baustelle_im_eigenen_unternehmen(baustelle_id));

-- =============================================================================
-- 10. favoriten: rein persoenliche Zuordnung, aber ohne Pruefung liesse sich
--     eine fremde baustelle_id favorisieren (kein Datenleck, nur Hygiene).
-- =============================================================================

drop policy if exists "favoriten: nur eigene anlegen" on public.favoriten;
create policy "favoriten: nur eigene anlegen" on public.favoriten for insert to authenticated
  with check (auth.uid() = user_id and public.baustelle_im_eigenen_unternehmen(baustelle_id));

-- Hinweis: plan_markierungen existiert nicht mehr (Migration 0002 hat die
-- Tabelle schon frueh zugunsten von Pins direkt auf maengel.position_x/y
-- gedroppt) -- hier deshalb keine Policy-Anpassung noetig.

-- =============================================================================
-- 12. statusvorlagen / statusvorlage_werte: bisher komplett unternehmens-
--     uebergreifend offen ("for all using (true)").
-- =============================================================================

drop policy if exists "statusvorlagen: alle lesen" on public.statusvorlagen;
create policy "statusvorlagen: eigenes Unternehmen lesen" on public.statusvorlagen for select to authenticated
  using (unternehmen_id = public.current_unternehmen_id());
drop policy if exists "statusvorlagen: admin/planer anlegen" on public.statusvorlagen;
create policy "statusvorlagen: admin/planer anlegen" on public.statusvorlagen for insert to authenticated
  with check (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());
drop policy if exists "statusvorlagen: admin/planer aendern" on public.statusvorlagen;
create policy "statusvorlagen: admin/planer aendern" on public.statusvorlagen for update to authenticated
  using (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id())
  with check (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());
drop policy if exists "statusvorlagen: admin/planer loeschen" on public.statusvorlagen;
create policy "statusvorlagen: admin/planer loeschen" on public.statusvorlagen for delete to authenticated
  using (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

drop policy if exists "statusvorlage_werte: alle lesen" on public.statusvorlage_werte;
create policy "statusvorlage_werte: eigenes Unternehmen lesen" on public.statusvorlage_werte for select to authenticated
  using (exists (select 1 from public.statusvorlagen sv where sv.id = statusvorlage_werte.statusvorlage_id and sv.unternehmen_id = public.current_unternehmen_id()));
drop policy if exists "statusvorlage_werte: admin/planer anlegen" on public.statusvorlage_werte;
create policy "statusvorlage_werte: admin/planer anlegen" on public.statusvorlage_werte for insert to authenticated
  with check (public.current_role() in ('admin', 'planer') and exists (select 1 from public.statusvorlagen sv where sv.id = statusvorlage_werte.statusvorlage_id and sv.unternehmen_id = public.current_unternehmen_id()));
drop policy if exists "statusvorlage_werte: admin/planer aendern" on public.statusvorlage_werte;
create policy "statusvorlage_werte: admin/planer aendern" on public.statusvorlage_werte for update to authenticated
  using (public.current_role() in ('admin', 'planer') and exists (select 1 from public.statusvorlagen sv where sv.id = statusvorlage_werte.statusvorlage_id and sv.unternehmen_id = public.current_unternehmen_id()))
  with check (public.current_role() in ('admin', 'planer') and exists (select 1 from public.statusvorlagen sv where sv.id = statusvorlage_werte.statusvorlage_id and sv.unternehmen_id = public.current_unternehmen_id()));
drop policy if exists "statusvorlage_werte: admin/planer loeschen" on public.statusvorlage_werte;
create policy "statusvorlage_werte: admin/planer loeschen" on public.statusvorlage_werte for delete to authenticated
  using (public.current_role() in ('admin', 'planer') and exists (select 1 from public.statusvorlagen sv where sv.id = statusvorlage_werte.statusvorlage_id and sv.unternehmen_id = public.current_unternehmen_id()));

-- =============================================================================
-- 13. Storage: private Buckets waren zwar login-pflichtig, aber nicht nach
--     Unternehmen getrennt -- jeder eingeloggte Nutzer konnte jeden Pfad
--     lesen/schreiben, unabhaengig davon, welcher Firma die Datei gehoert.
-- =============================================================================

-- mangel-fotos: drei Pfad-Schemata im Einsatz (siehe Arbeitszeit.tsx,
-- MangelDetails.tsx, Maengel.tsx): "<baustelle_id>/...",
-- "zeiterfassung/<mangel_id>/...", "kommentare/<mangel_id>/...".
create or replace function public.mangel_foto_pfad_erlaubt(p_pfad text)
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
  if teile[1] in ('zeiterfassung', 'kommentare') then
    if array_length(teile, 1) < 2 then
      return false;
    end if;
    return public.mangel_im_eigenen_unternehmen(teile[2]::uuid);
  end if;
  return public.baustelle_im_eigenen_unternehmen(teile[1]::uuid);
exception
  when invalid_text_representation then
    return false;
end;
$$;

drop policy if exists "mangel-fotos: eingeloggte Nutzer lesen/schreiben" on storage.objects;
create policy "mangel-fotos: zugriffsberechtigte lesen" on storage.objects for select to authenticated
  using (bucket_id = 'mangel-fotos' and public.mangel_foto_pfad_erlaubt(name));
create policy "mangel-fotos: schreibberechtigte hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'mangel-fotos' and public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_foto_pfad_erlaubt(name));
create policy "mangel-fotos: schreibberechtigte aendern" on storage.objects for update to authenticated
  using (bucket_id = 'mangel-fotos' and public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_foto_pfad_erlaubt(name));
create policy "mangel-fotos: schreibberechtigte loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'mangel-fotos' and public.current_role() in ('admin', 'planer', 'techniker') and public.mangel_foto_pfad_erlaubt(name));

-- plaene / dokumente / projekt-logos: einheitlich "<baustelle_id>/...".
create or replace function public.baustelle_ordner_erlaubt(p_pfad text)
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
  return public.baustelle_im_eigenen_unternehmen(teile[1]::uuid);
exception
  when invalid_text_representation then
    return false;
end;
$$;

drop policy if exists "plaene-bucket: eingeloggte Nutzer lesen/schreiben" on storage.objects;
create policy "plaene-bucket: zugriffsberechtigte lesen" on storage.objects for select to authenticated
  using (bucket_id = 'plaene' and public.baustelle_ordner_erlaubt(name));
create policy "plaene-bucket: schreibberechtigte hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'plaene' and public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_ordner_erlaubt(name));
create policy "plaene-bucket: schreibberechtigte aendern" on storage.objects for update to authenticated
  using (bucket_id = 'plaene' and public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_ordner_erlaubt(name));
create policy "plaene-bucket: schreibberechtigte loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'plaene' and public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_ordner_erlaubt(name));

drop policy if exists "dokumente-bucket: eingeloggte Nutzer lesen" on storage.objects;
drop policy if exists "dokumente-bucket: schreibberechtigte hochladen" on storage.objects;
drop policy if exists "dokumente-bucket: schreibberechtigte aendern" on storage.objects;
drop policy if exists "dokumente-bucket: schreibberechtigte loeschen" on storage.objects;
create policy "dokumente-bucket: zugriffsberechtigte lesen" on storage.objects for select to authenticated
  using (bucket_id = 'dokumente' and public.baustelle_ordner_erlaubt(name));
create policy "dokumente-bucket: schreibberechtigte hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'dokumente' and public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_ordner_erlaubt(name));
create policy "dokumente-bucket: schreibberechtigte aendern" on storage.objects for update to authenticated
  using (bucket_id = 'dokumente' and public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_ordner_erlaubt(name));
create policy "dokumente-bucket: schreibberechtigte loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'dokumente' and public.current_role() in ('admin', 'planer', 'techniker') and public.baustelle_ordner_erlaubt(name));

drop policy if exists "projekt-logos: eingeloggte Nutzer lesen" on storage.objects;
drop policy if exists "projekt-logos: admin/planer hochladen" on storage.objects;
drop policy if exists "projekt-logos: admin/planer aendern" on storage.objects;
drop policy if exists "projekt-logos: admin/planer loeschen" on storage.objects;
create policy "projekt-logos: zugriffsberechtigte lesen" on storage.objects for select to authenticated
  using (bucket_id = 'projekt-logos' and public.baustelle_ordner_erlaubt(name));
create policy "projekt-logos: admin/planer hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'projekt-logos' and public.current_role() in ('admin', 'planer') and public.baustelle_ordner_erlaubt(name));
create policy "projekt-logos: admin/planer aendern" on storage.objects for update to authenticated
  using (bucket_id = 'projekt-logos' and public.current_role() in ('admin', 'planer') and public.baustelle_ordner_erlaubt(name));
create policy "projekt-logos: admin/planer loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'projekt-logos' and public.current_role() in ('admin', 'planer') and public.baustelle_ordner_erlaubt(name));

-- unternehmen-logos: "<unternehmen_id>/...".
create or replace function public.unternehmen_ordner_erlaubt(p_pfad text)
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
  return teile[1]::uuid = public.current_unternehmen_id();
exception
  when invalid_text_representation then
    return false;
end;
$$;

drop policy if exists "unternehmen-logos: eingeloggte Nutzer lesen" on storage.objects;
drop policy if exists "unternehmen-logos: admin/planer hochladen" on storage.objects;
drop policy if exists "unternehmen-logos: admin/planer aendern" on storage.objects;
drop policy if exists "unternehmen-logos: admin/planer loeschen" on storage.objects;
create policy "unternehmen-logos: zugriffsberechtigte lesen" on storage.objects for select to authenticated
  using (bucket_id = 'unternehmen-logos' and public.unternehmen_ordner_erlaubt(name));
create policy "unternehmen-logos: admin/planer hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'unternehmen-logos' and public.current_role() in ('admin', 'planer') and public.unternehmen_ordner_erlaubt(name));
create policy "unternehmen-logos: admin/planer aendern" on storage.objects for update to authenticated
  using (bucket_id = 'unternehmen-logos' and public.current_role() in ('admin', 'planer') and public.unternehmen_ordner_erlaubt(name));
create policy "unternehmen-logos: admin/planer loeschen" on storage.objects for delete to authenticated
  using (bucket_id = 'unternehmen-logos' and public.current_role() in ('admin', 'planer') and public.unternehmen_ordner_erlaubt(name));

-- app-updates bleibt bewusst unveraendert: das Live-Update-Bundle ist keine
-- Mandantendaten, sondern derselbe App-Build fuer alle Firmen gleichermassen.
