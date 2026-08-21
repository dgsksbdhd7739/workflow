-- Schema-Umbenennung passend zur UI-Terminologie: "Baustelle" -> "Projekt",
-- "Mangel"/"Maengel" -> "Aufgabe". Reine Rename-Operationen sind bei Postgres
-- Metadaten-Aenderungen ohne Tabellen-Rewrite: Fremdschluessel, Indizes,
-- RLS-Policies und Views folgen automatisch (sie referenzieren Spalten/
-- Tabellen/Funktionen intern ueber attnum/OID, nicht per Text) -- keine der
-- ca. 40 bestehenden Policies muss deshalb angefasst werden.
--
-- Einzige Ausnahme: Funktionskoerper (SQL/PLpgSQL) und NEW/OLD-Feldzugriffe
-- in Trigger-Funktionen speichern referenzierte Namen als Text und muessen
-- daher manuell nachgezogen werden (Abschnitt 5).
--
-- Bewusst NICHT angefasst: der Storage-Bucket "mangel-fotos" (Umbenennen
-- eines Supabase-Storage-Buckets ist keine Metadaten-Operation, sondern
-- erfordert das Kopieren aller bestehenden Dateien in einen neuen Bucket --
-- separates, risikoreicheres Vorhaben, siehe TODO.md).

-- =============================================================================
-- 1. Tabellen umbenennen
-- =============================================================================

alter table public.baustellen rename to projekte;
alter table public.baustelle_kunden rename to projekt_kunden;
alter table public.maengel rename to aufgaben;
alter table public.mangel_material rename to aufgabe_material;
alter table public.mangel_kommentare rename to aufgabe_kommentare;
alter table public.mangel_phasen rename to aufgabe_phasen;

-- =============================================================================
-- 2. Spalten umbenennen: baustelle_id -> projekt_id
-- =============================================================================

alter table public.aufgaben rename column baustelle_id to projekt_id;
alter table public.plaene rename column baustelle_id to projekt_id;
alter table public.tagesberichte rename column baustelle_id to projekt_id;
alter table public.termine rename column baustelle_id to projekt_id;
alter table public.leistungen rename column baustelle_id to projekt_id;
alter table public.zeiterfassung rename column baustelle_id to projekt_id;
alter table public.dokumente rename column baustelle_id to projekt_id;
alter table public.favoriten rename column baustelle_id to projekt_id;
alter table public.projekt_chat_nachrichten rename column baustelle_id to projekt_id;
alter table public.projekt_kunden rename column baustelle_id to projekt_id;

-- =============================================================================
-- 3. Spalten umbenennen: mangel_id -> aufgabe_id
-- =============================================================================

alter table public.aufgabe_material rename column mangel_id to aufgabe_id;
alter table public.aufgabe_kommentare rename column mangel_id to aufgabe_id;
alter table public.aufgabe_phasen rename column mangel_id to aufgabe_id;
alter table public.dokumente rename column mangel_id to aufgabe_id;
alter table public.zeiterfassung rename column mangel_id to aufgabe_id;
alter table public.tagesbericht_tueren rename column mangel_id to aufgabe_id;

-- =============================================================================
-- 4. Indizes umbenennen (rein kosmetisch, ohne Funktionsaenderung)
-- =============================================================================

alter index if exists baustellen_unternehmen_idx rename to projekte_unternehmen_idx;
alter index if exists dokumente_baustelle_idx rename to dokumente_projekt_idx;
alter index if exists dokumente_mangel_idx rename to dokumente_aufgabe_idx;
alter index if exists projekt_chat_baustelle_zeit_idx rename to projekt_chat_projekt_zeit_idx;

-- =============================================================================
-- 5. Funktionen: umbenennen + Koerper auf neue Namen nachziehen.
--    ALTER FUNCTION RENAME behaelt die OID -- Aufrufer ueber RLS-Policies
--    (per OID gebunden) bleiben unangetastet funktionsfaehig. Der SQL-Text
--    IM Funktionskoerper wird davon aber nicht beruehrt und muss deshalb per
--    CREATE OR REPLACE neu geschrieben werden.
-- =============================================================================

alter function public.baustelle_im_eigenen_unternehmen(uuid) rename to projekt_im_eigenen_unternehmen;
alter function public.mangel_im_eigenen_unternehmen(uuid) rename to aufgabe_im_eigenen_unternehmen;
alter function public.mangel_foto_pfad_erlaubt(text) rename to aufgabe_foto_pfad_erlaubt;
alter function public.baustelle_ordner_erlaubt(text) rename to projekt_ordner_erlaubt;

-- Parameternamen bleiben bewusst unveraendert (p_baustelle_id/p_mangel_id):
-- CREATE OR REPLACE FUNCTION lehnt eine Parameter-Umbenennung fuer eine
-- bestehende Funktion mit SQLSTATE 42P13 ab, nur der Koerper darf sich
-- aendern. Rein kosmetisch, ohne Aussenwirkung (kein Aufrufer nutzt
-- benannte Parameter).
create or replace function public.projekt_im_eigenen_unternehmen(p_baustelle_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.projekte b
    where b.id = p_baustelle_id and b.unternehmen_id = public.current_unternehmen_id()
  )
$$;

create or replace function public.aufgabe_im_eigenen_unternehmen(p_mangel_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.aufgaben m
    where m.id = p_mangel_id and public.projekt_im_eigenen_unternehmen(m.projekt_id)
  )
$$;

create or replace function public.tagesbericht_im_eigenen_unternehmen(p_tagesbericht_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.tagesberichte t
    where t.id = p_tagesbericht_id and public.projekt_im_eigenen_unternehmen(t.projekt_id)
  )
$$;

create or replace function public.kunde_hat_zugriff(p_baustelle_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.projekt_im_eigenen_unternehmen(p_baustelle_id)
    and (
      public.current_role() is distinct from 'kunde'
      or exists (
        select 1 from public.projekt_kunden pk
        where pk.projekt_id = p_baustelle_id and pk.user_id = auth.uid()
      )
    )
$$;

-- mangel-fotos-Pfadschemata bleiben unveraendert ("<projekt_id>/...",
-- "zeiterfassung/<aufgabe_id>/...", "kommentare/<aufgabe_id>/..."), nur die
-- aufgerufenen Funktionsnamen aendern sich.
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
  if teile[1] in ('zeiterfassung', 'kommentare') then
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

create or replace function public.projekt_ordner_erlaubt(p_pfad text)
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
  return public.projekt_im_eigenen_unternehmen(teile[1]::uuid);
exception
  when invalid_text_representation then
    return false;
end;
$$;

-- Trigger-Funktion greift per NEW/OLD.mangel_id auf die soeben umbenannte
-- Spalte zu -- das ist reiner Text im Funktionskoerper und folgt der
-- Spaltenumbenennung (Abschnitt 3) nicht automatisch.
create or replace function public.protect_material_definition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.current_role() not in ('admin', 'planer') then
    new.bezeichnung := old.bezeichnung;
    new.menge := old.menge;
    new.einheit := old.einheit;
    new.reihenfolge := old.reihenfolge;
    new.aufgabe_id := old.aufgabe_id;
  end if;
  return new;
end;
$$;
