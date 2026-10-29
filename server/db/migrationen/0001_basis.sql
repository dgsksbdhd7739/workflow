-- Basis-Schema von WorkFlow (Tabellen, Funktionen, Trigger, RLS-Policies,
-- Rechte) fuer den Betrieb ohne Supabase. Setzt 0000_rollen_auth_storage.sql
-- voraus.
--
-- Erzeugt am 2026-10-29 per pg_dump --schema-only aus der auf den VPS
-- uebernommenen Supabase-Datenbank, nachdem die letzten Supabase-Dienst-
-- Abhaengigkeiten ersetzt wurden:
--   - notify_chat_nachricht(): pg_notify('chat_push') statt pg_net-Aufruf
--     der Edge Function send-chat-push (Versand macht jetzt server/)
--   - private.live_benachrichtigen() + Trigger auf beiden Chat-Tabellen:
--     pg_notify('live') statt supabase_realtime-Publication
--   - meine_aktiven_geraete(): auth.sitzungen statt auth.sessions
-- Die fruehere Migrationshistorie (0001-0060 unter supabase/migrations/)
-- steht in der Git-Historie.
--
-- Neue Aenderungen kommen als weitere, fortlaufend nummerierte Dateien in
-- diesen Ordner -- diese Datei nicht nachtraeglich aendern.

create schema if not exists private;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: live_benachrichtigen(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.live_benachrichtigen() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  zeile jsonb := to_jsonb(coalesce(new, old));
begin
  perform pg_notify('live', json_build_object(
    'tabelle', tg_table_name,
    'ereignis', tg_op,
    'id', zeile ->> 'id',
    'unternehmen_id', zeile ->> 'unternehmen_id',
    'projekt_id', zeile ->> 'projekt_id'
  )::text);
  return null;
end;
$$;


--
-- Name: aufgabe_foto_pfad_erlaubt(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aufgabe_foto_pfad_erlaubt(p_pfad text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: aufgabe_im_eigenen_unternehmen(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aufgabe_im_eigenen_unternehmen(p_mangel_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.aufgaben m
    where m.id = p_mangel_id and public.projekt_im_eigenen_unternehmen(m.projekt_id)
  )
$$;


--
-- Name: current_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."current_role"() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from public.profiles where id = auth.uid()
$$;


--
-- Name: current_unternehmen_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_unternehmen_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select unternehmen_id from public.profiles where id = auth.uid()
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: hat_modul_zugriff(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hat_modul_zugriff(p_modul text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not exists (
    select 1 from public.nutzer_modul_sperren
    where user_id = auth.uid() and modul = p_modul
  )
$$;


--
-- Name: ist_plattform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ist_plattform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.plattform_admins where user_id = auth.uid())
$$;


--
-- Name: ist_plattform_admin_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ist_plattform_admin_id(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.plattform_admins where user_id = p_user_id)
$$;


--
-- Name: ist_ticket_cc_empfaenger(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ist_ticket_cc_empfaenger(p_ticket_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.aufgabe_ticket_empfaenger e
    where e.ticket_id = p_ticket_id and e.user_id = auth.uid()
  )
$$;


--
-- Name: kunde_hat_zugriff(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kunde_hat_zugriff(p_baustelle_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: nutzer_sitzungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutzer_sitzungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    geraet_kennung text NOT NULL,
    geraet_name text NOT NULL,
    letzter_zugriff timestamp with time zone DEFAULT now() NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    sitzung_id uuid
);


--
-- Name: meine_aktiven_geraete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.meine_aktiven_geraete() RETURNS SETOF public.nutzer_sitzungen
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from public.nutzer_sitzungen ns
  where ns.user_id = auth.uid()
    and not exists (
      select 1 from auth.sitzungen s
      where s.id = ns.sitzung_id
        and s.user_id = auth.uid()
        and s.beendet_am is null
        and s.laeuft_ab_am > now()
    );

  return query
    select * from public.nutzer_sitzungen
    where user_id = auth.uid()
    order by letzter_zugriff desc;
end;
$$;


--
-- Name: notify_chat_nachricht(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_chat_nachricht() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform pg_notify('chat_push', json_build_object('nachricht_id', new.id)::text);
  return new;
end;
$$;


--
-- Name: paket_erlaubt(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.paket_erlaubt(p_funktion text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.paket_erlaubt_fuer(public.current_unternehmen_id(), p_funktion)
$$;


--
-- Name: paket_erlaubt_fuer(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.paket_erlaubt_fuer(p_unternehmen_id uuid, p_funktion text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case (select paket from public.unternehmen where id = p_unternehmen_id)
    when 'business' then true
    when 'team' then p_funktion in ('projekt_chat', 'dokumente', 'termine', 'material', 'vorlagen', 'kunden')
    else false
  end
$$;


--
-- Name: plattform_unternehmen_uebersicht(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.plattform_unternehmen_uebersicht() RETURNS TABLE(id uuid, name text, paket text, max_nutzer integer, nutzer_anzahl bigint, erstellt_am timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select u.id, u.name, u.paket, u.max_nutzer, public.unternehmen_nutzer_anzahl(u.id), u.erstellt_am
  from public.unternehmen u
  where public.ist_plattform_admin()
  order by u.erstellt_am desc
$$;


--
-- Name: profiles_kunde_paket(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_kunde_paket() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.role = 'kunde'
     and (tg_op = 'INSERT' or old.role is distinct from 'kunde')
     and auth.uid() is not null
     and not public.paket_erlaubt_fuer(new.unternehmen_id, 'kunden') then
    raise exception 'Kunden-Zugänge sind erst ab dem Team-Paket verfügbar.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: projekt_im_eigenen_unternehmen(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projekt_im_eigenen_unternehmen(p_baustelle_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.projekte b
    where b.id = p_baustelle_id and b.unternehmen_id = public.current_unternehmen_id()
  )
$$;


--
-- Name: projekt_ordner_erlaubt(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projekt_ordner_erlaubt(p_pfad text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: projekte_paket_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.projekte_paket_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_paket text;
  v_aktiv bigint;
begin
  if auth.uid() is null or new.archiviert then
    return new;
  end if;
  if tg_op = 'UPDATE' and not old.archiviert then
    return new;
  end if;
  select paket into v_paket from public.unternehmen where id = new.unternehmen_id;
  if v_paket = 'starter' then
    select count(*) into v_aktiv from public.projekte
    where unternehmen_id = new.unternehmen_id and not archiviert and id <> new.id;
    if v_aktiv >= 5 then
      raise exception 'Im Starter-Paket sind maximal 5 aktive Projekte möglich. Bitte ein Projekt archivieren oder auf das Team-Paket wechseln.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;


--
-- Name: protect_material_definition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_material_definition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: protect_role_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_role_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.role is distinct from old.role
     and public.current_role() is distinct from 'admin'
     and coalesce(auth.role(), '') is distinct from 'service_role'
  then
    new.role := old.role;
  end if;
  return new;
end;
$$;


--
-- Name: tagesbericht_im_eigenen_unternehmen(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tagesbericht_im_eigenen_unternehmen(p_tagesbericht_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.tagesberichte t
    where t.id = p_tagesbericht_id and public.projekt_im_eigenen_unternehmen(t.projekt_id)
  )
$$;


--
-- Name: unternehmen_max_nutzer_schuetzen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unternehmen_max_nutzer_schuetzen() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if (new.max_nutzer is distinct from old.max_nutzer or new.paket is distinct from old.paket)
     and auth.uid() is not null
     and not public.ist_plattform_admin() then
    raise exception 'Nur Plattform-Admins duerfen Paket und Nutzerlimit aendern'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


--
-- Name: unternehmen_nutzer_anzahl(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unternehmen_nutzer_anzahl(p_unternehmen_id uuid) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*) from public.profiles p
  where p.unternehmen_id = p_unternehmen_id
    and not exists (select 1 from public.plattform_admins pa where pa.user_id = p.id)
$$;


--
-- Name: unternehmen_ordner_erlaubt(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unternehmen_ordner_erlaubt(p_pfad text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: app_settings; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.app_settings (
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: schema_migrationen; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.schema_migrationen (
    name text NOT NULL,
    eingespielt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: aufgabe_kommentare; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aufgabe_kommentare (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aufgabe_id uuid NOT NULL,
    text text,
    foto_pfad text,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mangel_kommentare_check CHECK (((text IS NOT NULL) OR (foto_pfad IS NOT NULL)))
);


--
-- Name: aufgabe_material; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aufgabe_material (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aufgabe_id uuid NOT NULL,
    bezeichnung text NOT NULL,
    menge numeric DEFAULT 1 NOT NULL,
    einheit text,
    erledigt boolean DEFAULT false NOT NULL,
    reihenfolge integer DEFAULT 0 NOT NULL,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    material_stamm_id uuid
);


--
-- Name: aufgabe_phasen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aufgabe_phasen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aufgabe_id uuid NOT NULL,
    titel text NOT NULL,
    reihenfolge integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'offen'::text NOT NULL,
    notiz text,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mangel_phasen_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'in_bearbeitung'::text, 'erledigt'::text])))
);


--
-- Name: aufgabe_ticket_empfaenger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aufgabe_ticket_empfaenger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    user_id uuid NOT NULL,
    hinzugefuegt_von uuid NOT NULL,
    hinzugefuegt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: aufgabe_ticket_feldwerte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aufgabe_ticket_feldwerte (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    feld_id uuid NOT NULL,
    wert text
);


--
-- Name: aufgabe_ticket_fotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aufgabe_ticket_fotos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    foto_pfad text NOT NULL,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: aufgabe_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aufgabe_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    aufgabe_id uuid NOT NULL,
    text text NOT NULL,
    status text DEFAULT 'offen'::text NOT NULL,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    erledigt_von uuid,
    erledigt_am timestamp with time zone,
    bestaetigung_kommentar text,
    erledigen_bis date,
    nachfrist date,
    ist_gesperrt boolean DEFAULT false NOT NULL,
    formular_id uuid,
    CONSTRAINT aufgabe_tickets_nachfrist_nach_faelligkeit CHECK (((nachfrist IS NULL) OR (erledigen_bis IS NULL) OR (nachfrist >= erledigen_bis))),
    CONSTRAINT aufgabe_tickets_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'erledigt'::text])))
);


--
-- Name: aufgaben; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aufgaben (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projekt_id uuid NOT NULL,
    titel text NOT NULL,
    beschreibung text,
    status text DEFAULT 'offen'::text NOT NULL,
    prioritaet text DEFAULT 'mittel'::text NOT NULL,
    verantwortlicher_id uuid,
    faellig_am date,
    foto_pfad text,
    plan_id uuid,
    position_x double precision,
    position_y double precision,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    farbe text,
    status_wert_id uuid,
    abnahme_nummer text,
    position_x2 double precision,
    position_y2 double precision,
    label_x numeric,
    label_y numeric,
    CONSTRAINT maengel_prioritaet_check CHECK ((prioritaet = ANY (ARRAY['niedrig'::text, 'mittel'::text, 'hoch'::text]))),
    CONSTRAINT maengel_status_check CHECK ((status = ANY (ARRAY['offen'::text, 'in_bearbeitung'::text, 'erledigt'::text])))
);


--
-- Name: aufgaben_filter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aufgaben_filter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    projekt_id uuid NOT NULL,
    name text NOT NULL,
    filter jsonb NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_nachrichten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_nachrichten (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unternehmen_id uuid NOT NULL,
    user_id uuid NOT NULL,
    text text NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dokument_freigaben; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dokument_freigaben (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dokument_id uuid NOT NULL,
    status text NOT NULL,
    kommentar text,
    angefordert_von uuid NOT NULL,
    angefordert_am timestamp with time zone DEFAULT now() NOT NULL,
    entschieden_von uuid,
    entschieden_am timestamp with time zone,
    CONSTRAINT dokument_freigaben_status_check CHECK ((status = ANY (ARRAY['angefordert'::text, 'freigegeben'::text, 'abgelehnt'::text])))
);


--
-- Name: dokument_ordner; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dokument_ordner (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projekt_id uuid NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dokumente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dokumente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projekt_id uuid NOT NULL,
    aufgabe_id uuid,
    name text NOT NULL,
    datei_pfad text NOT NULL,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    kategorie text DEFAULT 'projekt'::text NOT NULL,
    freigabestatus text DEFAULT 'keine_anforderung'::text NOT NULL,
    vorgaenger_id uuid,
    ordner_id uuid,
    groesse_bytes bigint,
    CONSTRAINT dokumente_freigabestatus_check CHECK ((freigabestatus = ANY (ARRAY['keine_anforderung'::text, 'angefordert'::text, 'freigegeben'::text, 'abgelehnt'::text]))),
    CONSTRAINT dokumente_kategorie_check CHECK ((kategorie = ANY (ARRAY['projekt'::text, 'aufgabe'::text])))
);


--
-- Name: favoriten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favoriten (
    user_id uuid NOT NULL,
    projekt_id uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leistungen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leistungen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projekt_id uuid NOT NULL,
    position_nr integer DEFAULT 0 NOT NULL,
    bezeichnung text NOT NULL,
    menge numeric DEFAULT 1 NOT NULL,
    einheit text DEFAULT 'Stk'::text NOT NULL,
    einzelpreis numeric DEFAULT 0 NOT NULL,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: material_stamm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_stamm (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unternehmen_id uuid NOT NULL,
    bezeichnung text NOT NULL,
    einheit text,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    hersteller text,
    artikelnummer text
);


--
-- Name: nutzer_modul_sperren; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nutzer_modul_sperren (
    user_id uuid NOT NULL,
    modul text NOT NULL,
    gesperrt_von uuid NOT NULL,
    gesperrt_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nutzer_modul_sperren_modul_check CHECK ((modul = ANY (ARRAY['material'::text, 'dokumente'::text, 'tagesberichte'::text, 'termine'::text])))
);


--
-- Name: plaene; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plaene (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projekt_id uuid NOT NULL,
    name text NOT NULL,
    datei_pfad text NOT NULL,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    statusvorlage_id uuid
);


--
-- Name: plattform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plattform_admins (
    user_id uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text DEFAULT ''::text NOT NULL,
    role text DEFAULT 'techniker'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    muss_passwort_aendern boolean DEFAULT true NOT NULL,
    deaktiviert boolean DEFAULT false NOT NULL,
    unternehmen_id uuid NOT NULL,
    onboarding_gesehen boolean DEFAULT false NOT NULL,
    telefon text,
    positionsbezeichnung text,
    strasse text,
    plz text,
    stadt text,
    produkt_hinweise boolean DEFAULT true NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text, 'kunde'::text])))
);


--
-- Name: projekt_chat_nachrichten; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projekt_chat_nachrichten (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projekt_id uuid NOT NULL,
    user_id uuid NOT NULL,
    text text NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projekt_kunden; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projekt_kunden (
    projekt_id uuid NOT NULL,
    user_id uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: projekte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projekte (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    adresse text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    projektnummer text,
    projektleiter_id uuid,
    bauleitender_obermonteur_id uuid,
    kunde_name text,
    projekt_beginn date,
    projekt_ende date,
    sprache text DEFAULT 'Deutsch'::text NOT NULL,
    logo_pfad text,
    projekt_land text,
    projekt_strasse text,
    projekt_hausnummer text,
    projekt_adresszusatz text,
    projekt_plz text,
    projekt_stadt text,
    kunden_land text,
    kunden_strasse text,
    kunden_hausnummer text,
    kunden_adresszusatz text,
    kunden_plz text,
    kunden_stadt text,
    archiviert boolean DEFAULT false NOT NULL,
    unternehmen_id uuid DEFAULT public.current_unternehmen_id() NOT NULL
);


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    plattform text DEFAULT 'android'::text NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: statusvorlage_werte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.statusvorlage_werte (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    statusvorlage_id uuid NOT NULL,
    titel text NOT NULL,
    farbe text DEFAULT '#6b7280'::text NOT NULL,
    reihenfolge integer DEFAULT 0 NOT NULL,
    ist_standard boolean DEFAULT false NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: statusvorlagen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.statusvorlagen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    ist_standard boolean DEFAULT false NOT NULL,
    unternehmen_id uuid DEFAULT public.current_unternehmen_id() NOT NULL
);


--
-- Name: tagesbericht_tueren; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tagesbericht_tueren (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tagesbericht_id uuid NOT NULL,
    aufgabe_id uuid,
    titel text NOT NULL,
    stand text NOT NULL,
    reihenfolge integer DEFAULT 0 NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tagesbericht_vorlagen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tagesbericht_vorlagen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unternehmen_id uuid DEFAULT public.current_unternehmen_id() NOT NULL,
    name text NOT NULL,
    ist_standard boolean DEFAULT false NOT NULL,
    pdf_datei_pfad text,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tagesberichte; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tagesberichte (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projekt_id uuid NOT NULL,
    datum date DEFAULT CURRENT_DATE NOT NULL,
    personal_anzahl integer,
    taetigkeiten text,
    besonderheiten text,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    vorlage_id uuid
);


--
-- Name: termine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.termine (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projekt_id uuid NOT NULL,
    titel text NOT NULL,
    start_datum date NOT NULL,
    end_datum date NOT NULL,
    status text DEFAULT 'geplant'::text NOT NULL,
    vorgaenger_id uuid,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT termine_check CHECK ((end_datum >= start_datum)),
    CONSTRAINT termine_status_check CHECK ((status = ANY (ARRAY['geplant'::text, 'laufend'::text, 'abgeschlossen'::text, 'verzoegert'::text])))
);


--
-- Name: ticket_formular_felder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_formular_felder (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    formular_id uuid NOT NULL,
    titel text NOT NULL,
    feldtyp text DEFAULT 'text'::text NOT NULL,
    pflichtfeld boolean DEFAULT false NOT NULL,
    optionen text[],
    reihenfolge integer DEFAULT 0 NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ticket_formular_felder_feldtyp_check CHECK ((feldtyp = ANY (ARRAY['text'::text, 'zahl'::text, 'datum'::text, 'checkbox'::text, 'auswahl'::text])))
);


--
-- Name: ticket_formulare; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_formulare (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unternehmen_id uuid DEFAULT public.current_unternehmen_id() NOT NULL,
    name text NOT NULL,
    ist_standard boolean DEFAULT false NOT NULL,
    erstellt_von uuid NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: unternehmen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unternehmen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    logo_pfad text,
    strasse text,
    hausnummer text,
    plz text,
    stadt text,
    land text,
    telefon text,
    email text,
    website text,
    max_nutzer integer,
    paket text DEFAULT 'team'::text NOT NULL,
    CONSTRAINT unternehmen_paket_check CHECK ((paket = ANY (ARRAY['starter'::text, 'team'::text, 'business'::text])))
);


--
-- Name: zeiterfassung; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.zeiterfassung (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projekt_id uuid NOT NULL,
    user_id uuid NOT NULL,
    datum date DEFAULT CURRENT_DATE NOT NULL,
    start_zeit time without time zone NOT NULL,
    end_zeit time without time zone,
    pause_minuten integer DEFAULT 0 NOT NULL,
    taetigkeit text,
    erstellt_am timestamp with time zone DEFAULT now() NOT NULL,
    aufgabe_id uuid,
    foto_pfad text
);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: schema_migrationen schema_migrationen_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.schema_migrationen
    ADD CONSTRAINT schema_migrationen_pkey PRIMARY KEY (name);


--
-- Name: aufgabe_ticket_empfaenger aufgabe_ticket_empfaenger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_empfaenger
    ADD CONSTRAINT aufgabe_ticket_empfaenger_pkey PRIMARY KEY (id);


--
-- Name: aufgabe_ticket_empfaenger aufgabe_ticket_empfaenger_ticket_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_empfaenger
    ADD CONSTRAINT aufgabe_ticket_empfaenger_ticket_id_user_id_key UNIQUE (ticket_id, user_id);


--
-- Name: aufgabe_ticket_feldwerte aufgabe_ticket_feldwerte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_feldwerte
    ADD CONSTRAINT aufgabe_ticket_feldwerte_pkey PRIMARY KEY (id);


--
-- Name: aufgabe_ticket_feldwerte aufgabe_ticket_feldwerte_ticket_id_feld_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_feldwerte
    ADD CONSTRAINT aufgabe_ticket_feldwerte_ticket_id_feld_id_key UNIQUE (ticket_id, feld_id);


--
-- Name: aufgabe_ticket_fotos aufgabe_ticket_fotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_fotos
    ADD CONSTRAINT aufgabe_ticket_fotos_pkey PRIMARY KEY (id);


--
-- Name: aufgabe_tickets aufgabe_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_tickets
    ADD CONSTRAINT aufgabe_tickets_pkey PRIMARY KEY (id);


--
-- Name: aufgaben_filter aufgaben_filter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgaben_filter
    ADD CONSTRAINT aufgaben_filter_pkey PRIMARY KEY (id);


--
-- Name: projekt_kunden baustelle_kunden_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekt_kunden
    ADD CONSTRAINT baustelle_kunden_pkey PRIMARY KEY (projekt_id, user_id);


--
-- Name: projekte baustellen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekte
    ADD CONSTRAINT baustellen_pkey PRIMARY KEY (id);


--
-- Name: chat_nachrichten chat_nachrichten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_nachrichten
    ADD CONSTRAINT chat_nachrichten_pkey PRIMARY KEY (id);


--
-- Name: dokument_freigaben dokument_freigaben_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_freigaben
    ADD CONSTRAINT dokument_freigaben_pkey PRIMARY KEY (id);


--
-- Name: dokument_ordner dokument_ordner_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_ordner
    ADD CONSTRAINT dokument_ordner_pkey PRIMARY KEY (id);


--
-- Name: dokumente dokumente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokumente
    ADD CONSTRAINT dokumente_pkey PRIMARY KEY (id);


--
-- Name: favoriten favoriten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favoriten
    ADD CONSTRAINT favoriten_pkey PRIMARY KEY (user_id, projekt_id);


--
-- Name: leistungen leistungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leistungen
    ADD CONSTRAINT leistungen_pkey PRIMARY KEY (id);


--
-- Name: aufgaben maengel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgaben
    ADD CONSTRAINT maengel_pkey PRIMARY KEY (id);


--
-- Name: aufgabe_kommentare mangel_kommentare_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_kommentare
    ADD CONSTRAINT mangel_kommentare_pkey PRIMARY KEY (id);


--
-- Name: aufgabe_material mangel_material_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_material
    ADD CONSTRAINT mangel_material_pkey PRIMARY KEY (id);


--
-- Name: aufgabe_phasen mangel_phasen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_phasen
    ADD CONSTRAINT mangel_phasen_pkey PRIMARY KEY (id);


--
-- Name: material_stamm material_stamm_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_stamm
    ADD CONSTRAINT material_stamm_pkey PRIMARY KEY (id);


--
-- Name: nutzer_modul_sperren nutzer_modul_sperren_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutzer_modul_sperren
    ADD CONSTRAINT nutzer_modul_sperren_pkey PRIMARY KEY (user_id, modul);


--
-- Name: nutzer_sitzungen nutzer_sitzungen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutzer_sitzungen
    ADD CONSTRAINT nutzer_sitzungen_pkey PRIMARY KEY (id);


--
-- Name: nutzer_sitzungen nutzer_sitzungen_user_id_geraet_kennung_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutzer_sitzungen
    ADD CONSTRAINT nutzer_sitzungen_user_id_geraet_kennung_key UNIQUE (user_id, geraet_kennung);


--
-- Name: plaene plaene_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plaene
    ADD CONSTRAINT plaene_pkey PRIMARY KEY (id);


--
-- Name: plattform_admins plattform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plattform_admins
    ADD CONSTRAINT plattform_admins_pkey PRIMARY KEY (user_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: projekt_chat_nachrichten projekt_chat_nachrichten_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekt_chat_nachrichten
    ADD CONSTRAINT projekt_chat_nachrichten_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_user_id_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_token_key UNIQUE (user_id, token);


--
-- Name: statusvorlage_werte statusvorlage_werte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statusvorlage_werte
    ADD CONSTRAINT statusvorlage_werte_pkey PRIMARY KEY (id);


--
-- Name: statusvorlagen statusvorlagen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statusvorlagen
    ADD CONSTRAINT statusvorlagen_pkey PRIMARY KEY (id);


--
-- Name: tagesbericht_tueren tagesbericht_tueren_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesbericht_tueren
    ADD CONSTRAINT tagesbericht_tueren_pkey PRIMARY KEY (id);


--
-- Name: tagesbericht_vorlagen tagesbericht_vorlagen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesbericht_vorlagen
    ADD CONSTRAINT tagesbericht_vorlagen_pkey PRIMARY KEY (id);


--
-- Name: tagesberichte tagesberichte_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesberichte
    ADD CONSTRAINT tagesberichte_pkey PRIMARY KEY (id);


--
-- Name: termine termine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.termine
    ADD CONSTRAINT termine_pkey PRIMARY KEY (id);


--
-- Name: ticket_formular_felder ticket_formular_felder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_formular_felder
    ADD CONSTRAINT ticket_formular_felder_pkey PRIMARY KEY (id);


--
-- Name: ticket_formulare ticket_formulare_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_formulare
    ADD CONSTRAINT ticket_formulare_pkey PRIMARY KEY (id);


--
-- Name: unternehmen unternehmen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unternehmen
    ADD CONSTRAINT unternehmen_pkey PRIMARY KEY (id);


--
-- Name: zeiterfassung zeiterfassung_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zeiterfassung
    ADD CONSTRAINT zeiterfassung_pkey PRIMARY KEY (id);


--
-- Name: aufgabe_ticket_empfaenger_ticket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aufgabe_ticket_empfaenger_ticket_idx ON public.aufgabe_ticket_empfaenger USING btree (ticket_id);


--
-- Name: aufgabe_ticket_feldwerte_ticket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aufgabe_ticket_feldwerte_ticket_idx ON public.aufgabe_ticket_feldwerte USING btree (ticket_id);


--
-- Name: aufgabe_ticket_fotos_ticket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aufgabe_ticket_fotos_ticket_idx ON public.aufgabe_ticket_fotos USING btree (ticket_id);


--
-- Name: aufgabe_tickets_aufgabe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aufgabe_tickets_aufgabe_idx ON public.aufgabe_tickets USING btree (aufgabe_id);


--
-- Name: aufgaben_filter_user_projekt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX aufgaben_filter_user_projekt_idx ON public.aufgaben_filter USING btree (user_id, projekt_id);


--
-- Name: chat_nachrichten_unternehmen_zeit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_nachrichten_unternehmen_zeit_idx ON public.chat_nachrichten USING btree (unternehmen_id, erstellt_am);


--
-- Name: dokument_freigaben_dokument_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dokument_freigaben_dokument_idx ON public.dokument_freigaben USING btree (dokument_id);


--
-- Name: dokument_ordner_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dokument_ordner_parent_idx ON public.dokument_ordner USING btree (parent_id);


--
-- Name: dokument_ordner_projekt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dokument_ordner_projekt_idx ON public.dokument_ordner USING btree (projekt_id);


--
-- Name: dokumente_aufgabe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dokumente_aufgabe_idx ON public.dokumente USING btree (aufgabe_id);


--
-- Name: dokumente_projekt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dokumente_projekt_idx ON public.dokumente USING btree (projekt_id);


--
-- Name: material_stamm_unternehmen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX material_stamm_unternehmen_idx ON public.material_stamm USING btree (unternehmen_id);


--
-- Name: nutzer_sitzungen_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nutzer_sitzungen_user_idx ON public.nutzer_sitzungen USING btree (user_id);


--
-- Name: projekt_chat_projekt_zeit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projekt_chat_projekt_zeit_idx ON public.projekt_chat_nachrichten USING btree (projekt_id, erstellt_am);


--
-- Name: projekte_unternehmen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX projekte_unternehmen_idx ON public.projekte USING btree (unternehmen_id);


--
-- Name: statusvorlagen_unternehmen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX statusvorlagen_unternehmen_idx ON public.statusvorlagen USING btree (unternehmen_id);


--
-- Name: tagesbericht_tueren_bericht_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tagesbericht_tueren_bericht_idx ON public.tagesbericht_tueren USING btree (tagesbericht_id);


--
-- Name: tagesbericht_vorlagen_unternehmen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tagesbericht_vorlagen_unternehmen_idx ON public.tagesbericht_vorlagen USING btree (unternehmen_id);


--
-- Name: ticket_formular_felder_formular_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_formular_felder_formular_idx ON public.ticket_formular_felder USING btree (formular_id);


--
-- Name: ticket_formulare_unternehmen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ticket_formulare_unternehmen_idx ON public.ticket_formulare USING btree (unternehmen_id);


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: chat_nachrichten live_chat_nachrichten; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER live_chat_nachrichten AFTER INSERT OR DELETE ON public.chat_nachrichten FOR EACH ROW EXECUTE FUNCTION private.live_benachrichtigen();


--
-- Name: projekt_chat_nachrichten live_projekt_chat_nachrichten; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER live_projekt_chat_nachrichten AFTER INSERT OR DELETE ON public.projekt_chat_nachrichten FOR EACH ROW EXECUTE FUNCTION private.live_benachrichtigen();


--
-- Name: chat_nachrichten on_chat_nachricht_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_chat_nachricht_insert AFTER INSERT ON public.chat_nachrichten FOR EACH ROW EXECUTE FUNCTION public.notify_chat_nachricht();


--
-- Name: profiles profiles_kunde_paket; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_kunde_paket BEFORE INSERT OR UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_kunde_paket();


--
-- Name: projekte projekte_paket_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER projekte_paket_limit BEFORE INSERT OR UPDATE OF archiviert ON public.projekte FOR EACH ROW EXECUTE FUNCTION public.projekte_paket_limit();


--
-- Name: aufgabe_material protect_material_definition_before_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_material_definition_before_update BEFORE UPDATE ON public.aufgabe_material FOR EACH ROW EXECUTE FUNCTION public.protect_material_definition();


--
-- Name: profiles protect_role_before_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_role_before_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_role_column();


--
-- Name: unternehmen unternehmen_max_nutzer_schuetzen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER unternehmen_max_nutzer_schuetzen BEFORE UPDATE ON public.unternehmen FOR EACH ROW EXECUTE FUNCTION public.unternehmen_max_nutzer_schuetzen();


--
-- Name: aufgabe_ticket_empfaenger aufgabe_ticket_empfaenger_hinzugefuegt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_empfaenger
    ADD CONSTRAINT aufgabe_ticket_empfaenger_hinzugefuegt_von_fkey FOREIGN KEY (hinzugefuegt_von) REFERENCES public.profiles(id);


--
-- Name: aufgabe_ticket_empfaenger aufgabe_ticket_empfaenger_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_empfaenger
    ADD CONSTRAINT aufgabe_ticket_empfaenger_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.aufgabe_tickets(id) ON DELETE CASCADE;


--
-- Name: aufgabe_ticket_empfaenger aufgabe_ticket_empfaenger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_empfaenger
    ADD CONSTRAINT aufgabe_ticket_empfaenger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: aufgabe_ticket_feldwerte aufgabe_ticket_feldwerte_feld_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_feldwerte
    ADD CONSTRAINT aufgabe_ticket_feldwerte_feld_id_fkey FOREIGN KEY (feld_id) REFERENCES public.ticket_formular_felder(id) ON DELETE CASCADE;


--
-- Name: aufgabe_ticket_feldwerte aufgabe_ticket_feldwerte_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_feldwerte
    ADD CONSTRAINT aufgabe_ticket_feldwerte_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.aufgabe_tickets(id) ON DELETE CASCADE;


--
-- Name: aufgabe_ticket_fotos aufgabe_ticket_fotos_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_fotos
    ADD CONSTRAINT aufgabe_ticket_fotos_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: aufgabe_ticket_fotos aufgabe_ticket_fotos_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_ticket_fotos
    ADD CONSTRAINT aufgabe_ticket_fotos_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.aufgabe_tickets(id) ON DELETE CASCADE;


--
-- Name: aufgabe_tickets aufgabe_tickets_aufgabe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_tickets
    ADD CONSTRAINT aufgabe_tickets_aufgabe_id_fkey FOREIGN KEY (aufgabe_id) REFERENCES public.aufgaben(id) ON DELETE CASCADE;


--
-- Name: aufgabe_tickets aufgabe_tickets_erledigt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_tickets
    ADD CONSTRAINT aufgabe_tickets_erledigt_von_fkey FOREIGN KEY (erledigt_von) REFERENCES public.profiles(id);


--
-- Name: aufgabe_tickets aufgabe_tickets_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_tickets
    ADD CONSTRAINT aufgabe_tickets_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: aufgabe_tickets aufgabe_tickets_formular_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_tickets
    ADD CONSTRAINT aufgabe_tickets_formular_id_fkey FOREIGN KEY (formular_id) REFERENCES public.ticket_formulare(id) ON DELETE SET NULL;


--
-- Name: aufgaben_filter aufgaben_filter_projekt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgaben_filter
    ADD CONSTRAINT aufgaben_filter_projekt_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: aufgaben_filter aufgaben_filter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgaben_filter
    ADD CONSTRAINT aufgaben_filter_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: projekt_kunden baustelle_kunden_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekt_kunden
    ADD CONSTRAINT baustelle_kunden_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: projekt_kunden baustelle_kunden_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekt_kunden
    ADD CONSTRAINT baustelle_kunden_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: projekte baustellen_bauleitender_obermonteur_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekte
    ADD CONSTRAINT baustellen_bauleitender_obermonteur_id_fkey FOREIGN KEY (bauleitender_obermonteur_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: projekte baustellen_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekte
    ADD CONSTRAINT baustellen_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: projekte baustellen_projektleiter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekte
    ADD CONSTRAINT baustellen_projektleiter_id_fkey FOREIGN KEY (projektleiter_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: projekte baustellen_unternehmen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekte
    ADD CONSTRAINT baustellen_unternehmen_id_fkey FOREIGN KEY (unternehmen_id) REFERENCES public.unternehmen(id);


--
-- Name: chat_nachrichten chat_nachrichten_unternehmen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_nachrichten
    ADD CONSTRAINT chat_nachrichten_unternehmen_id_fkey FOREIGN KEY (unternehmen_id) REFERENCES public.unternehmen(id) ON DELETE CASCADE;


--
-- Name: chat_nachrichten chat_nachrichten_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_nachrichten
    ADD CONSTRAINT chat_nachrichten_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: dokument_freigaben dokument_freigaben_angefordert_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_freigaben
    ADD CONSTRAINT dokument_freigaben_angefordert_von_fkey FOREIGN KEY (angefordert_von) REFERENCES public.profiles(id);


--
-- Name: dokument_freigaben dokument_freigaben_dokument_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_freigaben
    ADD CONSTRAINT dokument_freigaben_dokument_id_fkey FOREIGN KEY (dokument_id) REFERENCES public.dokumente(id) ON DELETE CASCADE;


--
-- Name: dokument_freigaben dokument_freigaben_entschieden_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_freigaben
    ADD CONSTRAINT dokument_freigaben_entschieden_von_fkey FOREIGN KEY (entschieden_von) REFERENCES public.profiles(id);


--
-- Name: dokument_ordner dokument_ordner_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_ordner
    ADD CONSTRAINT dokument_ordner_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: dokument_ordner dokument_ordner_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_ordner
    ADD CONSTRAINT dokument_ordner_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.dokument_ordner(id) ON DELETE CASCADE;


--
-- Name: dokument_ordner dokument_ordner_projekt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokument_ordner
    ADD CONSTRAINT dokument_ordner_projekt_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: dokumente dokumente_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokumente
    ADD CONSTRAINT dokumente_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: dokumente dokumente_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokumente
    ADD CONSTRAINT dokumente_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: dokumente dokumente_mangel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokumente
    ADD CONSTRAINT dokumente_mangel_id_fkey FOREIGN KEY (aufgabe_id) REFERENCES public.aufgaben(id) ON DELETE SET NULL;


--
-- Name: dokumente dokumente_ordner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokumente
    ADD CONSTRAINT dokumente_ordner_id_fkey FOREIGN KEY (ordner_id) REFERENCES public.dokument_ordner(id) ON DELETE SET NULL;


--
-- Name: dokumente dokumente_vorgaenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dokumente
    ADD CONSTRAINT dokumente_vorgaenger_id_fkey FOREIGN KEY (vorgaenger_id) REFERENCES public.dokumente(id) ON DELETE SET NULL;


--
-- Name: favoriten favoriten_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favoriten
    ADD CONSTRAINT favoriten_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: favoriten favoriten_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favoriten
    ADD CONSTRAINT favoriten_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: leistungen leistungen_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leistungen
    ADD CONSTRAINT leistungen_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: leistungen leistungen_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leistungen
    ADD CONSTRAINT leistungen_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: aufgaben maengel_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgaben
    ADD CONSTRAINT maengel_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: aufgaben maengel_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgaben
    ADD CONSTRAINT maengel_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: aufgaben maengel_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgaben
    ADD CONSTRAINT maengel_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plaene(id) ON DELETE SET NULL;


--
-- Name: aufgaben maengel_status_wert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgaben
    ADD CONSTRAINT maengel_status_wert_id_fkey FOREIGN KEY (status_wert_id) REFERENCES public.statusvorlage_werte(id) ON DELETE SET NULL;


--
-- Name: aufgaben maengel_verantwortlicher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgaben
    ADD CONSTRAINT maengel_verantwortlicher_id_fkey FOREIGN KEY (verantwortlicher_id) REFERENCES public.profiles(id);


--
-- Name: aufgabe_kommentare mangel_kommentare_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_kommentare
    ADD CONSTRAINT mangel_kommentare_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: aufgabe_kommentare mangel_kommentare_mangel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_kommentare
    ADD CONSTRAINT mangel_kommentare_mangel_id_fkey FOREIGN KEY (aufgabe_id) REFERENCES public.aufgaben(id) ON DELETE CASCADE;


--
-- Name: aufgabe_material mangel_material_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_material
    ADD CONSTRAINT mangel_material_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: aufgabe_material mangel_material_mangel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_material
    ADD CONSTRAINT mangel_material_mangel_id_fkey FOREIGN KEY (aufgabe_id) REFERENCES public.aufgaben(id) ON DELETE CASCADE;


--
-- Name: aufgabe_material mangel_material_material_stamm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_material
    ADD CONSTRAINT mangel_material_material_stamm_id_fkey FOREIGN KEY (material_stamm_id) REFERENCES public.material_stamm(id) ON DELETE SET NULL;


--
-- Name: aufgabe_phasen mangel_phasen_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_phasen
    ADD CONSTRAINT mangel_phasen_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: aufgabe_phasen mangel_phasen_mangel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aufgabe_phasen
    ADD CONSTRAINT mangel_phasen_mangel_id_fkey FOREIGN KEY (aufgabe_id) REFERENCES public.aufgaben(id) ON DELETE CASCADE;


--
-- Name: material_stamm material_stamm_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_stamm
    ADD CONSTRAINT material_stamm_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: material_stamm material_stamm_unternehmen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_stamm
    ADD CONSTRAINT material_stamm_unternehmen_id_fkey FOREIGN KEY (unternehmen_id) REFERENCES public.unternehmen(id) ON DELETE CASCADE;


--
-- Name: nutzer_modul_sperren nutzer_modul_sperren_gesperrt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutzer_modul_sperren
    ADD CONSTRAINT nutzer_modul_sperren_gesperrt_von_fkey FOREIGN KEY (gesperrt_von) REFERENCES public.profiles(id);


--
-- Name: nutzer_modul_sperren nutzer_modul_sperren_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutzer_modul_sperren
    ADD CONSTRAINT nutzer_modul_sperren_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: nutzer_sitzungen nutzer_sitzungen_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nutzer_sitzungen
    ADD CONSTRAINT nutzer_sitzungen_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: plaene plaene_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plaene
    ADD CONSTRAINT plaene_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: plaene plaene_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plaene
    ADD CONSTRAINT plaene_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: plaene plaene_statusvorlage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plaene
    ADD CONSTRAINT plaene_statusvorlage_id_fkey FOREIGN KEY (statusvorlage_id) REFERENCES public.statusvorlagen(id) ON DELETE SET NULL;


--
-- Name: plattform_admins plattform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plattform_admins
    ADD CONSTRAINT plattform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_unternehmen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_unternehmen_id_fkey FOREIGN KEY (unternehmen_id) REFERENCES public.unternehmen(id);


--
-- Name: projekt_chat_nachrichten projekt_chat_nachrichten_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekt_chat_nachrichten
    ADD CONSTRAINT projekt_chat_nachrichten_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: projekt_chat_nachrichten projekt_chat_nachrichten_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projekt_chat_nachrichten
    ADD CONSTRAINT projekt_chat_nachrichten_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: push_tokens push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: statusvorlage_werte statusvorlage_werte_statusvorlage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statusvorlage_werte
    ADD CONSTRAINT statusvorlage_werte_statusvorlage_id_fkey FOREIGN KEY (statusvorlage_id) REFERENCES public.statusvorlagen(id) ON DELETE CASCADE;


--
-- Name: statusvorlagen statusvorlagen_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statusvorlagen
    ADD CONSTRAINT statusvorlagen_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: statusvorlagen statusvorlagen_unternehmen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statusvorlagen
    ADD CONSTRAINT statusvorlagen_unternehmen_id_fkey FOREIGN KEY (unternehmen_id) REFERENCES public.unternehmen(id);


--
-- Name: tagesbericht_tueren tagesbericht_tueren_mangel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesbericht_tueren
    ADD CONSTRAINT tagesbericht_tueren_mangel_id_fkey FOREIGN KEY (aufgabe_id) REFERENCES public.aufgaben(id) ON DELETE SET NULL;


--
-- Name: tagesbericht_tueren tagesbericht_tueren_tagesbericht_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesbericht_tueren
    ADD CONSTRAINT tagesbericht_tueren_tagesbericht_id_fkey FOREIGN KEY (tagesbericht_id) REFERENCES public.tagesberichte(id) ON DELETE CASCADE;


--
-- Name: tagesbericht_vorlagen tagesbericht_vorlagen_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesbericht_vorlagen
    ADD CONSTRAINT tagesbericht_vorlagen_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: tagesbericht_vorlagen tagesbericht_vorlagen_unternehmen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesbericht_vorlagen
    ADD CONSTRAINT tagesbericht_vorlagen_unternehmen_id_fkey FOREIGN KEY (unternehmen_id) REFERENCES public.unternehmen(id) ON DELETE CASCADE;


--
-- Name: tagesberichte tagesberichte_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesberichte
    ADD CONSTRAINT tagesberichte_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: tagesberichte tagesberichte_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesberichte
    ADD CONSTRAINT tagesberichte_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: tagesberichte tagesberichte_vorlage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tagesberichte
    ADD CONSTRAINT tagesberichte_vorlage_id_fkey FOREIGN KEY (vorlage_id) REFERENCES public.tagesbericht_vorlagen(id) ON DELETE SET NULL;


--
-- Name: termine termine_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.termine
    ADD CONSTRAINT termine_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: termine termine_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.termine
    ADD CONSTRAINT termine_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: termine termine_vorgaenger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.termine
    ADD CONSTRAINT termine_vorgaenger_id_fkey FOREIGN KEY (vorgaenger_id) REFERENCES public.termine(id) ON DELETE SET NULL;


--
-- Name: ticket_formular_felder ticket_formular_felder_formular_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_formular_felder
    ADD CONSTRAINT ticket_formular_felder_formular_id_fkey FOREIGN KEY (formular_id) REFERENCES public.ticket_formulare(id) ON DELETE CASCADE;


--
-- Name: ticket_formulare ticket_formulare_erstellt_von_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_formulare
    ADD CONSTRAINT ticket_formulare_erstellt_von_fkey FOREIGN KEY (erstellt_von) REFERENCES public.profiles(id);


--
-- Name: ticket_formulare ticket_formulare_unternehmen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_formulare
    ADD CONSTRAINT ticket_formulare_unternehmen_id_fkey FOREIGN KEY (unternehmen_id) REFERENCES public.unternehmen(id) ON DELETE CASCADE;


--
-- Name: zeiterfassung zeiterfassung_baustelle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zeiterfassung
    ADD CONSTRAINT zeiterfassung_baustelle_id_fkey FOREIGN KEY (projekt_id) REFERENCES public.projekte(id) ON DELETE CASCADE;


--
-- Name: zeiterfassung zeiterfassung_mangel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zeiterfassung
    ADD CONSTRAINT zeiterfassung_mangel_id_fkey FOREIGN KEY (aufgabe_id) REFERENCES public.aufgaben(id) ON DELETE SET NULL;


--
-- Name: zeiterfassung zeiterfassung_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.zeiterfassung
    ADD CONSTRAINT zeiterfassung_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: aufgabe_kommentare; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aufgabe_kommentare ENABLE ROW LEVEL SECURITY;

--
-- Name: aufgabe_material; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aufgabe_material ENABLE ROW LEVEL SECURITY;

--
-- Name: aufgabe_material aufgabe_material: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_material: paket aendern" ON public.aufgabe_material AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('material'::text));


--
-- Name: aufgabe_material aufgabe_material: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_material: paket anlegen" ON public.aufgabe_material AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('material'::text));


--
-- Name: aufgabe_phasen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aufgabe_phasen ENABLE ROW LEVEL SECURITY;

--
-- Name: aufgabe_ticket_empfaenger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aufgabe_ticket_empfaenger ENABLE ROW LEVEL SECURITY;

--
-- Name: aufgabe_ticket_empfaenger aufgabe_ticket_empfaenger: admin/planer entfernen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_ticket_empfaenger: admin/planer entfernen" ON public.aufgabe_ticket_empfaenger FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.aufgabe_tickets t
  WHERE ((t.id = aufgabe_ticket_empfaenger.ticket_id) AND public.aufgabe_im_eigenen_unternehmen(t.aufgabe_id))))));


--
-- Name: aufgabe_ticket_empfaenger aufgabe_ticket_empfaenger: admin/planer hinzufuegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_ticket_empfaenger: admin/planer hinzufuegen" ON public.aufgabe_ticket_empfaenger FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.aufgabe_tickets t
  WHERE ((t.id = aufgabe_ticket_empfaenger.ticket_id) AND public.aufgabe_im_eigenen_unternehmen(t.aufgabe_id))))));


--
-- Name: aufgabe_ticket_empfaenger aufgabe_ticket_empfaenger: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_ticket_empfaenger: zugriffsberechtigte lesen" ON public.aufgabe_ticket_empfaenger FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.aufgabe_tickets t
     JOIN public.aufgaben a ON ((a.id = t.aufgabe_id)))
  WHERE ((t.id = aufgabe_ticket_empfaenger.ticket_id) AND public.kunde_hat_zugriff(a.projekt_id)))));


--
-- Name: aufgabe_ticket_feldwerte; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aufgabe_ticket_feldwerte ENABLE ROW LEVEL SECURITY;

--
-- Name: aufgabe_ticket_feldwerte aufgabe_ticket_feldwerte: ersteller anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_ticket_feldwerte: ersteller anlegen" ON public.aufgabe_ticket_feldwerte FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'kunde'::text])) AND (EXISTS ( SELECT 1
   FROM (public.aufgabe_tickets t
     JOIN public.aufgaben a ON ((a.id = t.aufgabe_id)))
  WHERE ((t.id = aufgabe_ticket_feldwerte.ticket_id) AND public.kunde_hat_zugriff(a.projekt_id))))));


--
-- Name: aufgabe_ticket_feldwerte aufgabe_ticket_feldwerte: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_ticket_feldwerte: zugriffsberechtigte lesen" ON public.aufgabe_ticket_feldwerte FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.aufgabe_tickets t
     JOIN public.aufgaben a ON ((a.id = t.aufgabe_id)))
  WHERE ((t.id = aufgabe_ticket_feldwerte.ticket_id) AND public.kunde_hat_zugriff(a.projekt_id)))));


--
-- Name: aufgabe_ticket_fotos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aufgabe_ticket_fotos ENABLE ROW LEVEL SECURITY;

--
-- Name: aufgabe_ticket_fotos aufgabe_ticket_fotos: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_ticket_fotos: admin/planer loeschen" ON public.aufgabe_ticket_fotos FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.aufgabe_tickets t
  WHERE ((t.id = aufgabe_ticket_fotos.ticket_id) AND public.aufgabe_im_eigenen_unternehmen(t.aufgabe_id))))));


--
-- Name: aufgabe_ticket_fotos aufgabe_ticket_fotos: admin/planer/techniker hochladen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_ticket_fotos: admin/planer/techniker hochladen" ON public.aufgabe_ticket_fotos FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND (EXISTS ( SELECT 1
   FROM (public.aufgabe_tickets t
     JOIN public.aufgaben a ON ((a.id = t.aufgabe_id)))
  WHERE ((t.id = aufgabe_ticket_fotos.ticket_id) AND public.kunde_hat_zugriff(a.projekt_id))))));


--
-- Name: aufgabe_ticket_fotos aufgabe_ticket_fotos: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_ticket_fotos: zugriffsberechtigte lesen" ON public.aufgabe_ticket_fotos FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.aufgabe_tickets t
     JOIN public.aufgaben a ON ((a.id = t.aufgabe_id)))
  WHERE ((t.id = aufgabe_ticket_fotos.ticket_id) AND public.kunde_hat_zugriff(a.projekt_id)))));


--
-- Name: aufgabe_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aufgabe_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: aufgabe_tickets aufgabe_tickets: admin/planer aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_tickets: admin/planer aendern" ON public.aufgabe_tickets FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id)));


--
-- Name: aufgabe_tickets aufgabe_tickets: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_tickets: admin/planer loeschen" ON public.aufgabe_tickets FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id)));


--
-- Name: aufgabe_tickets aufgabe_tickets: cc-empfaenger lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_tickets: cc-empfaenger lesen" ON public.aufgabe_tickets FOR SELECT TO authenticated USING (public.ist_ticket_cc_empfaenger(id));


--
-- Name: aufgabe_tickets aufgabe_tickets: kunde/admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_tickets: kunde/admin/planer anlegen" ON public.aufgabe_tickets FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'kunde'::text])) AND (EXISTS ( SELECT 1
   FROM public.aufgaben a
  WHERE ((a.id = aufgabe_tickets.aufgabe_id) AND public.kunde_hat_zugriff(a.projekt_id))))));


--
-- Name: aufgabe_tickets aufgabe_tickets: techniker mit bestaetigung abschliessen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_tickets: techniker mit bestaetigung abschliessen" ON public.aufgabe_tickets FOR UPDATE TO authenticated USING (((public."current_role"() = 'techniker'::text) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id) AND (status = 'offen'::text) AND (NOT ist_gesperrt))) WITH CHECK (((public."current_role"() = 'techniker'::text) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id) AND (status = 'erledigt'::text) AND (NOT ist_gesperrt) AND (bestaetigung_kommentar IS NOT NULL) AND (length(TRIM(BOTH FROM bestaetigung_kommentar)) > 0)));


--
-- Name: aufgabe_tickets aufgabe_tickets: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgabe_tickets: zugriffsberechtigte lesen" ON public.aufgabe_tickets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.aufgaben a
  WHERE ((a.id = aufgabe_tickets.aufgabe_id) AND public.kunde_hat_zugriff(a.projekt_id)))));


--
-- Name: aufgaben; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aufgaben ENABLE ROW LEVEL SECURITY;

--
-- Name: aufgaben_filter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aufgaben_filter ENABLE ROW LEVEL SECURITY;

--
-- Name: aufgaben_filter aufgaben_filter: eigene anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgaben_filter: eigene anlegen" ON public.aufgaben_filter FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: aufgaben_filter aufgaben_filter: eigene lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgaben_filter: eigene lesen" ON public.aufgaben_filter FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: aufgaben_filter aufgaben_filter: eigene loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aufgaben_filter: eigene loeschen" ON public.aufgaben_filter FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: projekt_kunden baustelle_kunden: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "baustelle_kunden: admin/planer anlegen" ON public.projekt_kunden FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: projekt_kunden baustelle_kunden: admin/planer lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "baustelle_kunden: admin/planer lesen" ON public.projekt_kunden FOR SELECT TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: projekt_kunden baustelle_kunden: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "baustelle_kunden: admin/planer loeschen" ON public.projekt_kunden FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: projekte baustellen: admin/planer aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "baustellen: admin/planer aendern" ON public.projekte FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id()))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: projekte baustellen: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "baustellen: admin/planer anlegen" ON public.projekte FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: projekte baustellen: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "baustellen: admin/planer loeschen" ON public.projekte FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: projekte baustellen: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "baustellen: zugriffsberechtigte lesen" ON public.projekte FOR SELECT TO authenticated USING (((unternehmen_id = public.current_unternehmen_id()) AND ((public."current_role"() IS DISTINCT FROM 'kunde'::text) OR (EXISTS ( SELECT 1
   FROM public.projekt_kunden bk
  WHERE ((bk.projekt_id = projekte.id) AND (bk.user_id = auth.uid())))))));


--
-- Name: chat_nachrichten chat: eigene Nachricht loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat: eigene Nachricht loeschen" ON public.chat_nachrichten FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: chat_nachrichten chat: teammitglieder lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat: teammitglieder lesen" ON public.chat_nachrichten FOR SELECT TO authenticated USING (((unternehmen_id = public.current_unternehmen_id()) AND (public."current_role"() <> 'kunde'::text)));


--
-- Name: chat_nachrichten chat: teammitglieder schreiben; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "chat: teammitglieder schreiben" ON public.chat_nachrichten FOR INSERT TO authenticated WITH CHECK (((unternehmen_id = public.current_unternehmen_id()) AND (user_id = auth.uid()) AND (public."current_role"() <> 'kunde'::text)));


--
-- Name: chat_nachrichten; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_nachrichten ENABLE ROW LEVEL SECURITY;

--
-- Name: dokument_freigaben; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dokument_freigaben ENABLE ROW LEVEL SECURITY;

--
-- Name: dokument_freigaben dokument_freigaben: admin/planer entscheiden; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_freigaben: admin/planer entscheiden" ON public.dokument_freigaben FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.dokumente d
  WHERE ((d.id = dokument_freigaben.dokument_id) AND public.projekt_im_eigenen_unternehmen(d.projekt_id)))))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (status = ANY (ARRAY['freigegeben'::text, 'abgelehnt'::text]))));


--
-- Name: dokument_freigaben dokument_freigaben: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_freigaben: paket aendern" ON public.dokument_freigaben AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('dokumente'::text));


--
-- Name: dokument_freigaben dokument_freigaben: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_freigaben: paket anlegen" ON public.dokument_freigaben AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('dokumente'::text));


--
-- Name: dokument_freigaben dokument_freigaben: schreibberechtigte anfordern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_freigaben: schreibberechtigte anfordern" ON public.dokument_freigaben FOR INSERT TO authenticated WITH CHECK (((status = 'angefordert'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.hat_modul_zugriff('dokumente'::text) AND (EXISTS ( SELECT 1
   FROM public.dokumente d
  WHERE ((d.id = dokument_freigaben.dokument_id) AND public.projekt_im_eigenen_unternehmen(d.projekt_id))))));


--
-- Name: dokument_freigaben dokument_freigaben: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_freigaben: zugriffsberechtigte lesen" ON public.dokument_freigaben FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.dokumente d
  WHERE ((d.id = dokument_freigaben.dokument_id) AND public.kunde_hat_zugriff(d.projekt_id) AND public.hat_modul_zugriff('dokumente'::text)))));


--
-- Name: dokument_ordner; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dokument_ordner ENABLE ROW LEVEL SECURITY;

--
-- Name: dokument_ordner dokument_ordner: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_ordner: paket aendern" ON public.dokument_ordner AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('dokumente'::text));


--
-- Name: dokument_ordner dokument_ordner: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_ordner: paket anlegen" ON public.dokument_ordner AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('dokumente'::text));


--
-- Name: dokument_ordner dokument_ordner: schreibberechtigte aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_ordner: schreibberechtigte aendern" ON public.dokument_ordner FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.kunde_hat_zugriff(projekt_id)));


--
-- Name: dokument_ordner dokument_ordner: schreibberechtigte anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_ordner: schreibberechtigte anlegen" ON public.dokument_ordner FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.kunde_hat_zugriff(projekt_id)));


--
-- Name: dokument_ordner dokument_ordner: schreibberechtigte loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_ordner: schreibberechtigte loeschen" ON public.dokument_ordner FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.kunde_hat_zugriff(projekt_id)));


--
-- Name: dokument_ordner dokument_ordner: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokument_ordner: zugriffsberechtigte lesen" ON public.dokument_ordner FOR SELECT TO authenticated USING (public.kunde_hat_zugriff(projekt_id));


--
-- Name: dokumente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dokumente ENABLE ROW LEVEL SECURITY;

--
-- Name: dokumente dokumente: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokumente: paket aendern" ON public.dokumente AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('dokumente'::text));


--
-- Name: dokumente dokumente: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokumente: paket anlegen" ON public.dokumente AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('dokumente'::text));


--
-- Name: dokumente dokumente: schreibberechtigte aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokumente: schreibberechtigte aendern" ON public.dokumente FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('dokumente'::text))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('dokumente'::text)));


--
-- Name: dokumente dokumente: schreibberechtigte anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokumente: schreibberechtigte anlegen" ON public.dokumente FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('dokumente'::text)));


--
-- Name: dokumente dokumente: schreibberechtigte loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokumente: schreibberechtigte loeschen" ON public.dokumente FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('dokumente'::text)));


--
-- Name: dokumente dokumente: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dokumente: zugriffsberechtigte lesen" ON public.dokumente FOR SELECT TO authenticated USING ((public.kunde_hat_zugriff(projekt_id) AND public.hat_modul_zugriff('dokumente'::text)));


--
-- Name: favoriten; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favoriten ENABLE ROW LEVEL SECURITY;

--
-- Name: favoriten favoriten: nur eigene anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "favoriten: nur eigene anlegen" ON public.favoriten FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: favoriten favoriten: nur eigene loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "favoriten: nur eigene loeschen" ON public.favoriten FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: favoriten favoriten: nur eigene sehen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "favoriten: nur eigene sehen" ON public.favoriten FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: leistungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leistungen ENABLE ROW LEVEL SECURITY;

--
-- Name: leistungen leistungen: admin/planer aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leistungen: admin/planer aendern" ON public.leistungen FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: leistungen leistungen: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leistungen: admin/planer anlegen" ON public.leistungen FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: leistungen leistungen: admin/planer lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leistungen: admin/planer lesen" ON public.leistungen FOR SELECT TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: leistungen leistungen: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "leistungen: admin/planer loeschen" ON public.leistungen FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: aufgaben maengel: schreibberechtigte aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "maengel: schreibberechtigte aendern" ON public.aufgaben FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: aufgaben maengel: schreibberechtigte anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "maengel: schreibberechtigte anlegen" ON public.aufgaben FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: aufgaben maengel: schreibberechtigte loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "maengel: schreibberechtigte loeschen" ON public.aufgaben FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: aufgaben maengel: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "maengel: zugriffsberechtigte lesen" ON public.aufgaben FOR SELECT TO authenticated USING (public.kunde_hat_zugriff(projekt_id));


--
-- Name: aufgabe_kommentare mangel_kommentare: schreibberechtigte aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_kommentare: schreibberechtigte aendern" ON public.aufgabe_kommentare FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id)));


--
-- Name: aufgabe_kommentare mangel_kommentare: schreibberechtigte anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_kommentare: schreibberechtigte anlegen" ON public.aufgabe_kommentare FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id)));


--
-- Name: aufgabe_kommentare mangel_kommentare: schreibberechtigte loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_kommentare: schreibberechtigte loeschen" ON public.aufgabe_kommentare FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id)));


--
-- Name: aufgabe_kommentare mangel_kommentare: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_kommentare: zugriffsberechtigte lesen" ON public.aufgabe_kommentare FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.aufgaben m
  WHERE ((m.id = aufgabe_kommentare.aufgabe_id) AND public.kunde_hat_zugriff(m.projekt_id)))));


--
-- Name: aufgabe_material mangel_material: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_material: admin/planer anlegen" ON public.aufgabe_material FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id) AND public.hat_modul_zugriff('material'::text)));


--
-- Name: aufgabe_material mangel_material: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_material: admin/planer loeschen" ON public.aufgabe_material FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id) AND public.hat_modul_zugriff('material'::text)));


--
-- Name: aufgabe_material mangel_material: admin/planer/techniker aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_material: admin/planer/techniker aendern" ON public.aufgabe_material FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id) AND public.hat_modul_zugriff('material'::text))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id) AND public.hat_modul_zugriff('material'::text)));


--
-- Name: aufgabe_material mangel_material: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_material: zugriffsberechtigte lesen" ON public.aufgabe_material FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.aufgaben m
  WHERE ((m.id = aufgabe_material.aufgabe_id) AND public.kunde_hat_zugriff(m.projekt_id)))) AND public.hat_modul_zugriff('material'::text)));


--
-- Name: aufgabe_phasen mangel_phasen: schreibberechtigte aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_phasen: schreibberechtigte aendern" ON public.aufgabe_phasen FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id)));


--
-- Name: aufgabe_phasen mangel_phasen: schreibberechtigte anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_phasen: schreibberechtigte anlegen" ON public.aufgabe_phasen FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id)));


--
-- Name: aufgabe_phasen mangel_phasen: schreibberechtigte loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_phasen: schreibberechtigte loeschen" ON public.aufgabe_phasen FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_im_eigenen_unternehmen(aufgabe_id)));


--
-- Name: aufgabe_phasen mangel_phasen: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mangel_phasen: zugriffsberechtigte lesen" ON public.aufgabe_phasen FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.aufgaben m
  WHERE ((m.id = aufgabe_phasen.aufgabe_id) AND public.kunde_hat_zugriff(m.projekt_id)))));


--
-- Name: material_stamm; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_stamm ENABLE ROW LEVEL SECURITY;

--
-- Name: material_stamm material_stamm: admin/planer aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "material_stamm: admin/planer aendern" ON public.material_stamm FOR UPDATE TO authenticated USING (((unternehmen_id = public.current_unternehmen_id()) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text]))));


--
-- Name: material_stamm material_stamm: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "material_stamm: admin/planer anlegen" ON public.material_stamm FOR INSERT TO authenticated WITH CHECK (((unternehmen_id = public.current_unternehmen_id()) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text]))));


--
-- Name: material_stamm material_stamm: admin/planer lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "material_stamm: admin/planer lesen" ON public.material_stamm FOR SELECT TO authenticated USING (((unternehmen_id = public.current_unternehmen_id()) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text]))));


--
-- Name: material_stamm material_stamm: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "material_stamm: admin/planer loeschen" ON public.material_stamm FOR DELETE TO authenticated USING (((unternehmen_id = public.current_unternehmen_id()) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text]))));


--
-- Name: material_stamm material_stamm: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "material_stamm: paket aendern" ON public.material_stamm AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('material'::text));


--
-- Name: material_stamm material_stamm: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "material_stamm: paket anlegen" ON public.material_stamm AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('material'::text));


--
-- Name: nutzer_modul_sperren; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nutzer_modul_sperren ENABLE ROW LEVEL SECURITY;

--
-- Name: nutzer_modul_sperren nutzer_modul_sperren: admin/planer aufheben; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nutzer_modul_sperren: admin/planer aufheben" ON public.nutzer_modul_sperren FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = nutzer_modul_sperren.user_id) AND (p.unternehmen_id = public.current_unternehmen_id()))))));


--
-- Name: nutzer_modul_sperren nutzer_modul_sperren: admin/planer setzen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nutzer_modul_sperren: admin/planer setzen" ON public.nutzer_modul_sperren FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = nutzer_modul_sperren.user_id) AND (p.unternehmen_id = public.current_unternehmen_id()))))));


--
-- Name: nutzer_modul_sperren nutzer_modul_sperren: eigene oder admin/planer lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nutzer_modul_sperren: eigene oder admin/planer lesen" ON public.nutzer_modul_sperren FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR ((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = nutzer_modul_sperren.user_id) AND (p.unternehmen_id = public.current_unternehmen_id())))))));


--
-- Name: nutzer_modul_sperren nutzer_modul_sperren: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nutzer_modul_sperren: paket aendern" ON public.nutzer_modul_sperren AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('modulsperren'::text));


--
-- Name: nutzer_modul_sperren nutzer_modul_sperren: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nutzer_modul_sperren: paket anlegen" ON public.nutzer_modul_sperren AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('modulsperren'::text));


--
-- Name: nutzer_sitzungen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nutzer_sitzungen ENABLE ROW LEVEL SECURITY;

--
-- Name: nutzer_sitzungen nutzer_sitzungen: eigene aktualisieren; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nutzer_sitzungen: eigene aktualisieren" ON public.nutzer_sitzungen FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: nutzer_sitzungen nutzer_sitzungen: eigene anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nutzer_sitzungen: eigene anlegen" ON public.nutzer_sitzungen FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: nutzer_sitzungen nutzer_sitzungen: eigene lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nutzer_sitzungen: eigene lesen" ON public.nutzer_sitzungen FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: nutzer_sitzungen nutzer_sitzungen: eigene loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nutzer_sitzungen: eigene loeschen" ON public.nutzer_sitzungen FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: plaene; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plaene ENABLE ROW LEVEL SECURITY;

--
-- Name: plaene plaene: schreibberechtigte aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaene: schreibberechtigte aendern" ON public.plaene FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: plaene plaene: schreibberechtigte anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaene: schreibberechtigte anlegen" ON public.plaene FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: plaene plaene: schreibberechtigte loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaene: schreibberechtigte loeschen" ON public.plaene FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: plaene plaene: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plaene: zugriffsberechtigte lesen" ON public.plaene FOR SELECT TO authenticated USING (public.kunde_hat_zugriff(projekt_id));


--
-- Name: plattform_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plattform_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: plattform_admins plattform_admins: nur eigenen Eintrag lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plattform_admins: nur eigenen Eintrag lesen" ON public.plattform_admins FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles: Nutzer kann eigenes Profil aktualisieren; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: Nutzer kann eigenes Profil aktualisieren" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--
-- Name: profiles profiles: admin kann alle aktualisieren; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: admin kann alle aktualisieren" ON public.profiles FOR UPDATE TO authenticated USING ((public."current_role"() = 'admin'::text));


--
-- Name: profiles profiles: eigenes Unternehmen lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: eigenes Unternehmen lesen" ON public.profiles FOR SELECT TO authenticated USING (((unternehmen_id = public.current_unternehmen_id()) AND ((id = auth.uid()) OR (NOT public.ist_plattform_admin_id(id)))));


--
-- Name: projekt_chat_nachrichten projekt_chat: eigene Nachricht loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "projekt_chat: eigene Nachricht loeschen" ON public.projekt_chat_nachrichten FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: projekt_chat_nachrichten projekt_chat: teammitglieder lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "projekt_chat: teammitglieder lesen" ON public.projekt_chat_nachrichten FOR SELECT TO authenticated USING ((public.kunde_hat_zugriff(projekt_id) AND (public."current_role"() <> 'kunde'::text)));


--
-- Name: projekt_chat_nachrichten projekt_chat: teammitglieder schreiben; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "projekt_chat: teammitglieder schreiben" ON public.projekt_chat_nachrichten FOR INSERT TO authenticated WITH CHECK ((public.kunde_hat_zugriff(projekt_id) AND (user_id = auth.uid()) AND (public."current_role"() <> 'kunde'::text)));


--
-- Name: projekt_chat_nachrichten; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projekt_chat_nachrichten ENABLE ROW LEVEL SECURITY;

--
-- Name: projekt_chat_nachrichten projekt_chat_nachrichten: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "projekt_chat_nachrichten: paket aendern" ON public.projekt_chat_nachrichten AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('projekt_chat'::text));


--
-- Name: projekt_chat_nachrichten projekt_chat_nachrichten: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "projekt_chat_nachrichten: paket anlegen" ON public.projekt_chat_nachrichten AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('projekt_chat'::text));


--
-- Name: projekt_kunden; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projekt_kunden ENABLE ROW LEVEL SECURITY;

--
-- Name: projekte; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projekte ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens push_tokens: eigene aktualisieren; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push_tokens: eigene aktualisieren" ON public.push_tokens FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_tokens push_tokens: eigene anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push_tokens: eigene anlegen" ON public.push_tokens FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_tokens push_tokens: eigene lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push_tokens: eigene lesen" ON public.push_tokens FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: push_tokens push_tokens: eigene loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push_tokens: eigene loeschen" ON public.push_tokens FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: statusvorlage_werte; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.statusvorlage_werte ENABLE ROW LEVEL SECURITY;

--
-- Name: statusvorlage_werte statusvorlage_werte: admin/planer aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlage_werte: admin/planer aendern" ON public.statusvorlage_werte FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.statusvorlagen sv
  WHERE ((sv.id = statusvorlage_werte.statusvorlage_id) AND (sv.unternehmen_id = public.current_unternehmen_id())))))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.statusvorlagen sv
  WHERE ((sv.id = statusvorlage_werte.statusvorlage_id) AND (sv.unternehmen_id = public.current_unternehmen_id()))))));


--
-- Name: statusvorlage_werte statusvorlage_werte: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlage_werte: admin/planer anlegen" ON public.statusvorlage_werte FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.statusvorlagen sv
  WHERE ((sv.id = statusvorlage_werte.statusvorlage_id) AND (sv.unternehmen_id = public.current_unternehmen_id()))))));


--
-- Name: statusvorlage_werte statusvorlage_werte: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlage_werte: admin/planer loeschen" ON public.statusvorlage_werte FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.statusvorlagen sv
  WHERE ((sv.id = statusvorlage_werte.statusvorlage_id) AND (sv.unternehmen_id = public.current_unternehmen_id()))))));


--
-- Name: statusvorlage_werte statusvorlage_werte: eigenes Unternehmen lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlage_werte: eigenes Unternehmen lesen" ON public.statusvorlage_werte FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.statusvorlagen sv
  WHERE ((sv.id = statusvorlage_werte.statusvorlage_id) AND (sv.unternehmen_id = public.current_unternehmen_id())))));


--
-- Name: statusvorlage_werte statusvorlage_werte: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlage_werte: paket aendern" ON public.statusvorlage_werte AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('vorlagen'::text));


--
-- Name: statusvorlage_werte statusvorlage_werte: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlage_werte: paket anlegen" ON public.statusvorlage_werte AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('vorlagen'::text));


--
-- Name: statusvorlagen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.statusvorlagen ENABLE ROW LEVEL SECURITY;

--
-- Name: statusvorlagen statusvorlagen: admin/planer aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlagen: admin/planer aendern" ON public.statusvorlagen FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id()))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: statusvorlagen statusvorlagen: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlagen: admin/planer anlegen" ON public.statusvorlagen FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: statusvorlagen statusvorlagen: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlagen: admin/planer loeschen" ON public.statusvorlagen FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: statusvorlagen statusvorlagen: eigenes Unternehmen lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlagen: eigenes Unternehmen lesen" ON public.statusvorlagen FOR SELECT TO authenticated USING ((unternehmen_id = public.current_unternehmen_id()));


--
-- Name: statusvorlagen statusvorlagen: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlagen: paket aendern" ON public.statusvorlagen AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('vorlagen'::text));


--
-- Name: statusvorlagen statusvorlagen: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "statusvorlagen: paket anlegen" ON public.statusvorlagen AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('vorlagen'::text));


--
-- Name: tagesbericht_tueren; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tagesbericht_tueren ENABLE ROW LEVEL SECURITY;

--
-- Name: tagesbericht_tueren tagesbericht_tueren: nicht-kunden anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesbericht_tueren: nicht-kunden anlegen" ON public.tagesbericht_tueren FOR INSERT TO authenticated WITH CHECK (((public."current_role"() <> 'kunde'::text) AND public.tagesbericht_im_eigenen_unternehmen(tagesbericht_id)));


--
-- Name: tagesbericht_tueren tagesbericht_tueren: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesbericht_tueren: zugriffsberechtigte lesen" ON public.tagesbericht_tueren FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tagesberichte t
  WHERE ((t.id = tagesbericht_tueren.tagesbericht_id) AND public.kunde_hat_zugriff(t.projekt_id)))));


--
-- Name: tagesbericht_vorlagen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tagesbericht_vorlagen ENABLE ROW LEVEL SECURITY;

--
-- Name: tagesbericht_vorlagen tagesbericht_vorlagen: admin/planer aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesbericht_vorlagen: admin/planer aendern" ON public.tagesbericht_vorlagen FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id()))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: tagesbericht_vorlagen tagesbericht_vorlagen: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesbericht_vorlagen: admin/planer anlegen" ON public.tagesbericht_vorlagen FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: tagesbericht_vorlagen tagesbericht_vorlagen: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesbericht_vorlagen: admin/planer loeschen" ON public.tagesbericht_vorlagen FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: tagesbericht_vorlagen tagesbericht_vorlagen: eigenes unternehmen lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesbericht_vorlagen: eigenes unternehmen lesen" ON public.tagesbericht_vorlagen FOR SELECT TO authenticated USING ((unternehmen_id = public.current_unternehmen_id()));


--
-- Name: tagesbericht_vorlagen tagesbericht_vorlagen: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesbericht_vorlagen: paket aendern" ON public.tagesbericht_vorlagen AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('vorlagen'::text));


--
-- Name: tagesbericht_vorlagen tagesbericht_vorlagen: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesbericht_vorlagen: paket anlegen" ON public.tagesbericht_vorlagen AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('vorlagen'::text));


--
-- Name: tagesberichte; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tagesberichte ENABLE ROW LEVEL SECURITY;

--
-- Name: tagesberichte tagesberichte: schreibberechtigte aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesberichte: schreibberechtigte aendern" ON public.tagesberichte FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('tagesberichte'::text))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('tagesberichte'::text)));


--
-- Name: tagesberichte tagesberichte: schreibberechtigte anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesberichte: schreibberechtigte anlegen" ON public.tagesberichte FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('tagesberichte'::text)));


--
-- Name: tagesberichte tagesberichte: schreibberechtigte loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesberichte: schreibberechtigte loeschen" ON public.tagesberichte FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('tagesberichte'::text)));


--
-- Name: tagesberichte tagesberichte: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tagesberichte: zugriffsberechtigte lesen" ON public.tagesberichte FOR SELECT TO authenticated USING ((public.kunde_hat_zugriff(projekt_id) AND public.hat_modul_zugriff('tagesberichte'::text)));


--
-- Name: termine; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.termine ENABLE ROW LEVEL SECURITY;

--
-- Name: termine termine: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termine: paket aendern" ON public.termine AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('termine'::text));


--
-- Name: termine termine: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termine: paket anlegen" ON public.termine AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('termine'::text));


--
-- Name: termine termine: schreibberechtigte aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termine: schreibberechtigte aendern" ON public.termine FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('termine'::text))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('termine'::text)));


--
-- Name: termine termine: schreibberechtigte anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termine: schreibberechtigte anlegen" ON public.termine FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('termine'::text)));


--
-- Name: termine termine: schreibberechtigte loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termine: schreibberechtigte loeschen" ON public.termine FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id) AND public.hat_modul_zugriff('termine'::text)));


--
-- Name: termine termine: zugriffsberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "termine: zugriffsberechtigte lesen" ON public.termine FOR SELECT TO authenticated USING ((public.kunde_hat_zugriff(projekt_id) AND public.hat_modul_zugriff('termine'::text)));


--
-- Name: ticket_formular_felder; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_formular_felder ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_formular_felder ticket_formular_felder: admin/planer aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formular_felder: admin/planer aendern" ON public.ticket_formular_felder FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.ticket_formulare v
  WHERE ((v.id = ticket_formular_felder.formular_id) AND (v.unternehmen_id = public.current_unternehmen_id())))))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.ticket_formulare v
  WHERE ((v.id = ticket_formular_felder.formular_id) AND (v.unternehmen_id = public.current_unternehmen_id()))))));


--
-- Name: ticket_formular_felder ticket_formular_felder: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formular_felder: admin/planer anlegen" ON public.ticket_formular_felder FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.ticket_formulare v
  WHERE ((v.id = ticket_formular_felder.formular_id) AND (v.unternehmen_id = public.current_unternehmen_id()))))));


--
-- Name: ticket_formular_felder ticket_formular_felder: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formular_felder: admin/planer loeschen" ON public.ticket_formular_felder FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (EXISTS ( SELECT 1
   FROM public.ticket_formulare v
  WHERE ((v.id = ticket_formular_felder.formular_id) AND (v.unternehmen_id = public.current_unternehmen_id()))))));


--
-- Name: ticket_formular_felder ticket_formular_felder: eigenes unternehmen lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formular_felder: eigenes unternehmen lesen" ON public.ticket_formular_felder FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.ticket_formulare v
  WHERE ((v.id = ticket_formular_felder.formular_id) AND (v.unternehmen_id = public.current_unternehmen_id())))));


--
-- Name: ticket_formular_felder ticket_formular_felder: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formular_felder: paket aendern" ON public.ticket_formular_felder AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('vorlagen'::text));


--
-- Name: ticket_formular_felder ticket_formular_felder: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formular_felder: paket anlegen" ON public.ticket_formular_felder AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('vorlagen'::text));


--
-- Name: ticket_formulare; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_formulare ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_formulare ticket_formulare: admin/planer aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formulare: admin/planer aendern" ON public.ticket_formulare FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id()))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: ticket_formulare ticket_formulare: admin/planer anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formulare: admin/planer anlegen" ON public.ticket_formulare FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: ticket_formulare ticket_formulare: admin/planer loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formulare: admin/planer loeschen" ON public.ticket_formulare FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (unternehmen_id = public.current_unternehmen_id())));


--
-- Name: ticket_formulare ticket_formulare: eigenes unternehmen lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formulare: eigenes unternehmen lesen" ON public.ticket_formulare FOR SELECT TO authenticated USING ((unternehmen_id = public.current_unternehmen_id()));


--
-- Name: ticket_formulare ticket_formulare: paket aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formulare: paket aendern" ON public.ticket_formulare AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.paket_erlaubt('vorlagen'::text));


--
-- Name: ticket_formulare ticket_formulare: paket anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_formulare: paket anlegen" ON public.ticket_formulare AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.paket_erlaubt('vorlagen'::text));


--
-- Name: unternehmen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unternehmen ENABLE ROW LEVEL SECURITY;

--
-- Name: unternehmen unternehmen: admin/planer aktualisieren; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "unternehmen: admin/planer aktualisieren" ON public.unternehmen FOR UPDATE TO authenticated USING (((id = public.current_unternehmen_id()) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])))) WITH CHECK (((id = public.current_unternehmen_id()) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text]))));


--
-- Name: unternehmen unternehmen: eigenes Unternehmen lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "unternehmen: eigenes Unternehmen lesen" ON public.unternehmen FOR SELECT TO authenticated USING ((id = public.current_unternehmen_id()));


--
-- Name: unternehmen unternehmen: plattform-admin aktualisiert alle; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "unternehmen: plattform-admin aktualisiert alle" ON public.unternehmen FOR UPDATE TO authenticated USING (public.ist_plattform_admin()) WITH CHECK (public.ist_plattform_admin());


--
-- Name: unternehmen unternehmen: plattform-admin liest alle; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "unternehmen: plattform-admin liest alle" ON public.unternehmen FOR SELECT TO authenticated USING (public.ist_plattform_admin());


--
-- Name: zeiterfassung; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.zeiterfassung ENABLE ROW LEVEL SECURITY;

--
-- Name: zeiterfassung zeiterfassung: schreibberechtigte aendern; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "zeiterfassung: schreibberechtigte aendern" ON public.zeiterfassung FOR UPDATE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id))) WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: zeiterfassung zeiterfassung: schreibberechtigte anlegen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "zeiterfassung: schreibberechtigte anlegen" ON public.zeiterfassung FOR INSERT TO authenticated WITH CHECK (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: zeiterfassung zeiterfassung: schreibberechtigte lesen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "zeiterfassung: schreibberechtigte lesen" ON public.zeiterfassung FOR SELECT TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: zeiterfassung zeiterfassung: schreibberechtigte loeschen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "zeiterfassung: schreibberechtigte loeschen" ON public.zeiterfassung FOR DELETE TO authenticated USING (((public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_im_eigenen_unternehmen(projekt_id)));


--
-- Name: objects dokumente-bucket: schreibberechtigte aendern; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "dokumente-bucket: schreibberechtigte aendern" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'dokumente'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects dokumente-bucket: schreibberechtigte hochladen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "dokumente-bucket: schreibberechtigte hochladen" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'dokumente'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects dokumente-bucket: schreibberechtigte loeschen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "dokumente-bucket: schreibberechtigte loeschen" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'dokumente'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects dokumente-bucket: zugriffsberechtigte lesen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "dokumente-bucket: zugriffsberechtigte lesen" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'dokumente'::text) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects mangel-fotos: schreibberechtigte aendern; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "mangel-fotos: schreibberechtigte aendern" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'mangel-fotos'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_foto_pfad_erlaubt(name)));


--
-- Name: objects mangel-fotos: schreibberechtigte hochladen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "mangel-fotos: schreibberechtigte hochladen" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'mangel-fotos'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_foto_pfad_erlaubt(name)));


--
-- Name: objects mangel-fotos: schreibberechtigte loeschen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "mangel-fotos: schreibberechtigte loeschen" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'mangel-fotos'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.aufgabe_foto_pfad_erlaubt(name)));


--
-- Name: objects mangel-fotos: zugriffsberechtigte lesen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "mangel-fotos: zugriffsberechtigte lesen" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'mangel-fotos'::text) AND public.aufgabe_foto_pfad_erlaubt(name)));


--
-- Name: objects plaene-bucket: schreibberechtigte aendern; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "plaene-bucket: schreibberechtigte aendern" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'plaene'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects plaene-bucket: schreibberechtigte hochladen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "plaene-bucket: schreibberechtigte hochladen" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'plaene'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects plaene-bucket: schreibberechtigte loeschen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "plaene-bucket: schreibberechtigte loeschen" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'plaene'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text, 'techniker'::text])) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects plaene-bucket: zugriffsberechtigte lesen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "plaene-bucket: zugriffsberechtigte lesen" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'plaene'::text) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects projekt-logos: admin/planer aendern; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "projekt-logos: admin/planer aendern" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'projekt-logos'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects projekt-logos: admin/planer hochladen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "projekt-logos: admin/planer hochladen" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'projekt-logos'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects projekt-logos: admin/planer loeschen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "projekt-logos: admin/planer loeschen" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'projekt-logos'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects projekt-logos: zugriffsberechtigte lesen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "projekt-logos: zugriffsberechtigte lesen" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'projekt-logos'::text) AND public.projekt_ordner_erlaubt(name)));


--
-- Name: objects tagesbericht-vorlagen-bucket: admin/planer aendern; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "tagesbericht-vorlagen-bucket: admin/planer aendern" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'tagesbericht-vorlagen'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.unternehmen_ordner_erlaubt(name)));


--
-- Name: objects tagesbericht-vorlagen-bucket: admin/planer hochladen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "tagesbericht-vorlagen-bucket: admin/planer hochladen" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'tagesbericht-vorlagen'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.unternehmen_ordner_erlaubt(name)));


--
-- Name: objects tagesbericht-vorlagen-bucket: admin/planer loeschen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "tagesbericht-vorlagen-bucket: admin/planer loeschen" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'tagesbericht-vorlagen'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND public.unternehmen_ordner_erlaubt(name)));


--
-- Name: objects tagesbericht-vorlagen-bucket: zugriffsberechtigte lesen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "tagesbericht-vorlagen-bucket: zugriffsberechtigte lesen" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'tagesbericht-vorlagen'::text) AND public.unternehmen_ordner_erlaubt(name)));


--
-- Name: objects unternehmen-logos: admin/planer aendern; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "unternehmen-logos: admin/planer aendern" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'unternehmen-logos'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (public.unternehmen_ordner_erlaubt(name) OR public.ist_plattform_admin())));


--
-- Name: objects unternehmen-logos: admin/planer hochladen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "unternehmen-logos: admin/planer hochladen" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'unternehmen-logos'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (public.unternehmen_ordner_erlaubt(name) OR public.ist_plattform_admin())));


--
-- Name: objects unternehmen-logos: admin/planer loeschen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "unternehmen-logos: admin/planer loeschen" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'unternehmen-logos'::text) AND (public."current_role"() = ANY (ARRAY['admin'::text, 'planer'::text])) AND (public.unternehmen_ordner_erlaubt(name) OR public.ist_plattform_admin())));


--
-- Name: objects unternehmen-logos: zugriffsberechtigte lesen; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "unternehmen-logos: zugriffsberechtigte lesen" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'unternehmen-logos'::text) AND (public.unternehmen_ordner_erlaubt(name) OR public.ist_plattform_admin())));


--
-- Name: FUNCTION aufgabe_foto_pfad_erlaubt(p_pfad text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.aufgabe_foto_pfad_erlaubt(p_pfad text) TO anon;
GRANT ALL ON FUNCTION public.aufgabe_foto_pfad_erlaubt(p_pfad text) TO authenticated;
GRANT ALL ON FUNCTION public.aufgabe_foto_pfad_erlaubt(p_pfad text) TO service_role;


--
-- Name: FUNCTION aufgabe_im_eigenen_unternehmen(p_mangel_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.aufgabe_im_eigenen_unternehmen(p_mangel_id uuid) TO anon;
GRANT ALL ON FUNCTION public.aufgabe_im_eigenen_unternehmen(p_mangel_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.aufgabe_im_eigenen_unternehmen(p_mangel_id uuid) TO service_role;


--
-- Name: FUNCTION "current_role"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public."current_role"() TO anon;
GRANT ALL ON FUNCTION public."current_role"() TO authenticated;
GRANT ALL ON FUNCTION public."current_role"() TO service_role;


--
-- Name: FUNCTION current_unternehmen_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_unternehmen_id() TO anon;
GRANT ALL ON FUNCTION public.current_unternehmen_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_unternehmen_id() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION hat_modul_zugriff(p_modul text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.hat_modul_zugriff(p_modul text) TO anon;
GRANT ALL ON FUNCTION public.hat_modul_zugriff(p_modul text) TO authenticated;
GRANT ALL ON FUNCTION public.hat_modul_zugriff(p_modul text) TO service_role;


--
-- Name: FUNCTION ist_plattform_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ist_plattform_admin() TO anon;
GRANT ALL ON FUNCTION public.ist_plattform_admin() TO authenticated;
GRANT ALL ON FUNCTION public.ist_plattform_admin() TO service_role;


--
-- Name: FUNCTION ist_plattform_admin_id(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ist_plattform_admin_id(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.ist_plattform_admin_id(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ist_plattform_admin_id(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION ist_ticket_cc_empfaenger(p_ticket_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ist_ticket_cc_empfaenger(p_ticket_id uuid) TO anon;
GRANT ALL ON FUNCTION public.ist_ticket_cc_empfaenger(p_ticket_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ist_ticket_cc_empfaenger(p_ticket_id uuid) TO service_role;


--
-- Name: FUNCTION kunde_hat_zugriff(p_baustelle_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.kunde_hat_zugriff(p_baustelle_id uuid) TO anon;
GRANT ALL ON FUNCTION public.kunde_hat_zugriff(p_baustelle_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.kunde_hat_zugriff(p_baustelle_id uuid) TO service_role;


--
-- Name: TABLE nutzer_sitzungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nutzer_sitzungen TO anon;
GRANT ALL ON TABLE public.nutzer_sitzungen TO authenticated;
GRANT ALL ON TABLE public.nutzer_sitzungen TO service_role;


--
-- Name: FUNCTION meine_aktiven_geraete(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.meine_aktiven_geraete() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meine_aktiven_geraete() TO anon;
GRANT ALL ON FUNCTION public.meine_aktiven_geraete() TO authenticated;
GRANT ALL ON FUNCTION public.meine_aktiven_geraete() TO service_role;


--
-- Name: FUNCTION notify_chat_nachricht(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.notify_chat_nachricht() TO anon;
GRANT ALL ON FUNCTION public.notify_chat_nachricht() TO authenticated;
GRANT ALL ON FUNCTION public.notify_chat_nachricht() TO service_role;


--
-- Name: FUNCTION paket_erlaubt(p_funktion text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.paket_erlaubt(p_funktion text) TO anon;
GRANT ALL ON FUNCTION public.paket_erlaubt(p_funktion text) TO authenticated;
GRANT ALL ON FUNCTION public.paket_erlaubt(p_funktion text) TO service_role;


--
-- Name: FUNCTION paket_erlaubt_fuer(p_unternehmen_id uuid, p_funktion text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.paket_erlaubt_fuer(p_unternehmen_id uuid, p_funktion text) TO anon;
GRANT ALL ON FUNCTION public.paket_erlaubt_fuer(p_unternehmen_id uuid, p_funktion text) TO authenticated;
GRANT ALL ON FUNCTION public.paket_erlaubt_fuer(p_unternehmen_id uuid, p_funktion text) TO service_role;


--
-- Name: FUNCTION plattform_unternehmen_uebersicht(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.plattform_unternehmen_uebersicht() TO anon;
GRANT ALL ON FUNCTION public.plattform_unternehmen_uebersicht() TO authenticated;
GRANT ALL ON FUNCTION public.plattform_unternehmen_uebersicht() TO service_role;


--
-- Name: FUNCTION profiles_kunde_paket(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.profiles_kunde_paket() TO anon;
GRANT ALL ON FUNCTION public.profiles_kunde_paket() TO authenticated;
GRANT ALL ON FUNCTION public.profiles_kunde_paket() TO service_role;


--
-- Name: FUNCTION projekt_im_eigenen_unternehmen(p_baustelle_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projekt_im_eigenen_unternehmen(p_baustelle_id uuid) TO anon;
GRANT ALL ON FUNCTION public.projekt_im_eigenen_unternehmen(p_baustelle_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.projekt_im_eigenen_unternehmen(p_baustelle_id uuid) TO service_role;


--
-- Name: FUNCTION projekt_ordner_erlaubt(p_pfad text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projekt_ordner_erlaubt(p_pfad text) TO anon;
GRANT ALL ON FUNCTION public.projekt_ordner_erlaubt(p_pfad text) TO authenticated;
GRANT ALL ON FUNCTION public.projekt_ordner_erlaubt(p_pfad text) TO service_role;


--
-- Name: FUNCTION projekte_paket_limit(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.projekte_paket_limit() TO anon;
GRANT ALL ON FUNCTION public.projekte_paket_limit() TO authenticated;
GRANT ALL ON FUNCTION public.projekte_paket_limit() TO service_role;


--
-- Name: FUNCTION protect_material_definition(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_material_definition() TO anon;
GRANT ALL ON FUNCTION public.protect_material_definition() TO authenticated;
GRANT ALL ON FUNCTION public.protect_material_definition() TO service_role;


--
-- Name: FUNCTION protect_role_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_role_column() TO anon;
GRANT ALL ON FUNCTION public.protect_role_column() TO authenticated;
GRANT ALL ON FUNCTION public.protect_role_column() TO service_role;


--
-- Name: FUNCTION tagesbericht_im_eigenen_unternehmen(p_tagesbericht_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.tagesbericht_im_eigenen_unternehmen(p_tagesbericht_id uuid) TO anon;
GRANT ALL ON FUNCTION public.tagesbericht_im_eigenen_unternehmen(p_tagesbericht_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.tagesbericht_im_eigenen_unternehmen(p_tagesbericht_id uuid) TO service_role;


--
-- Name: FUNCTION unternehmen_max_nutzer_schuetzen(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unternehmen_max_nutzer_schuetzen() TO anon;
GRANT ALL ON FUNCTION public.unternehmen_max_nutzer_schuetzen() TO authenticated;
GRANT ALL ON FUNCTION public.unternehmen_max_nutzer_schuetzen() TO service_role;


--
-- Name: FUNCTION unternehmen_nutzer_anzahl(p_unternehmen_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unternehmen_nutzer_anzahl(p_unternehmen_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unternehmen_nutzer_anzahl(p_unternehmen_id uuid) TO service_role;


--
-- Name: FUNCTION unternehmen_ordner_erlaubt(p_pfad text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unternehmen_ordner_erlaubt(p_pfad text) TO anon;
GRANT ALL ON FUNCTION public.unternehmen_ordner_erlaubt(p_pfad text) TO authenticated;
GRANT ALL ON FUNCTION public.unternehmen_ordner_erlaubt(p_pfad text) TO service_role;


--
-- Name: TABLE aufgabe_kommentare; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aufgabe_kommentare TO anon;
GRANT ALL ON TABLE public.aufgabe_kommentare TO authenticated;
GRANT ALL ON TABLE public.aufgabe_kommentare TO service_role;


--
-- Name: TABLE aufgabe_material; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aufgabe_material TO anon;
GRANT ALL ON TABLE public.aufgabe_material TO authenticated;
GRANT ALL ON TABLE public.aufgabe_material TO service_role;


--
-- Name: TABLE aufgabe_phasen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aufgabe_phasen TO anon;
GRANT ALL ON TABLE public.aufgabe_phasen TO authenticated;
GRANT ALL ON TABLE public.aufgabe_phasen TO service_role;


--
-- Name: TABLE aufgabe_ticket_empfaenger; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aufgabe_ticket_empfaenger TO anon;
GRANT ALL ON TABLE public.aufgabe_ticket_empfaenger TO authenticated;
GRANT ALL ON TABLE public.aufgabe_ticket_empfaenger TO service_role;


--
-- Name: TABLE aufgabe_ticket_feldwerte; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aufgabe_ticket_feldwerte TO anon;
GRANT ALL ON TABLE public.aufgabe_ticket_feldwerte TO authenticated;
GRANT ALL ON TABLE public.aufgabe_ticket_feldwerte TO service_role;


--
-- Name: TABLE aufgabe_ticket_fotos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aufgabe_ticket_fotos TO anon;
GRANT ALL ON TABLE public.aufgabe_ticket_fotos TO authenticated;
GRANT ALL ON TABLE public.aufgabe_ticket_fotos TO service_role;


--
-- Name: TABLE aufgabe_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aufgabe_tickets TO anon;
GRANT ALL ON TABLE public.aufgabe_tickets TO authenticated;
GRANT ALL ON TABLE public.aufgabe_tickets TO service_role;


--
-- Name: TABLE aufgaben; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aufgaben TO anon;
GRANT ALL ON TABLE public.aufgaben TO authenticated;
GRANT ALL ON TABLE public.aufgaben TO service_role;


--
-- Name: TABLE aufgaben_filter; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.aufgaben_filter TO anon;
GRANT ALL ON TABLE public.aufgaben_filter TO authenticated;
GRANT ALL ON TABLE public.aufgaben_filter TO service_role;


--
-- Name: TABLE chat_nachrichten; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_nachrichten TO anon;
GRANT ALL ON TABLE public.chat_nachrichten TO authenticated;
GRANT ALL ON TABLE public.chat_nachrichten TO service_role;


--
-- Name: TABLE dokument_freigaben; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dokument_freigaben TO anon;
GRANT ALL ON TABLE public.dokument_freigaben TO authenticated;
GRANT ALL ON TABLE public.dokument_freigaben TO service_role;


--
-- Name: TABLE dokument_ordner; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dokument_ordner TO anon;
GRANT ALL ON TABLE public.dokument_ordner TO authenticated;
GRANT ALL ON TABLE public.dokument_ordner TO service_role;


--
-- Name: TABLE dokumente; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dokumente TO anon;
GRANT ALL ON TABLE public.dokumente TO authenticated;
GRANT ALL ON TABLE public.dokumente TO service_role;


--
-- Name: TABLE favoriten; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.favoriten TO anon;
GRANT ALL ON TABLE public.favoriten TO authenticated;
GRANT ALL ON TABLE public.favoriten TO service_role;


--
-- Name: TABLE leistungen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.leistungen TO anon;
GRANT ALL ON TABLE public.leistungen TO authenticated;
GRANT ALL ON TABLE public.leistungen TO service_role;


--
-- Name: TABLE material_stamm; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.material_stamm TO anon;
GRANT ALL ON TABLE public.material_stamm TO authenticated;
GRANT ALL ON TABLE public.material_stamm TO service_role;


--
-- Name: TABLE nutzer_modul_sperren; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.nutzer_modul_sperren TO anon;
GRANT ALL ON TABLE public.nutzer_modul_sperren TO authenticated;
GRANT ALL ON TABLE public.nutzer_modul_sperren TO service_role;


--
-- Name: TABLE plaene; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plaene TO anon;
GRANT ALL ON TABLE public.plaene TO authenticated;
GRANT ALL ON TABLE public.plaene TO service_role;


--
-- Name: TABLE plattform_admins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plattform_admins TO anon;
GRANT ALL ON TABLE public.plattform_admins TO authenticated;
GRANT ALL ON TABLE public.plattform_admins TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE projekt_chat_nachrichten; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projekt_chat_nachrichten TO anon;
GRANT ALL ON TABLE public.projekt_chat_nachrichten TO authenticated;
GRANT ALL ON TABLE public.projekt_chat_nachrichten TO service_role;


--
-- Name: TABLE projekt_kunden; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projekt_kunden TO anon;
GRANT ALL ON TABLE public.projekt_kunden TO authenticated;
GRANT ALL ON TABLE public.projekt_kunden TO service_role;


--
-- Name: TABLE projekte; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projekte TO anon;
GRANT ALL ON TABLE public.projekte TO authenticated;
GRANT ALL ON TABLE public.projekte TO service_role;


--
-- Name: TABLE push_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_tokens TO anon;
GRANT ALL ON TABLE public.push_tokens TO authenticated;
GRANT ALL ON TABLE public.push_tokens TO service_role;


--
-- Name: TABLE statusvorlage_werte; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.statusvorlage_werte TO anon;
GRANT ALL ON TABLE public.statusvorlage_werte TO authenticated;
GRANT ALL ON TABLE public.statusvorlage_werte TO service_role;


--
-- Name: TABLE statusvorlagen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.statusvorlagen TO anon;
GRANT ALL ON TABLE public.statusvorlagen TO authenticated;
GRANT ALL ON TABLE public.statusvorlagen TO service_role;


--
-- Name: TABLE tagesbericht_tueren; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tagesbericht_tueren TO anon;
GRANT ALL ON TABLE public.tagesbericht_tueren TO authenticated;
GRANT ALL ON TABLE public.tagesbericht_tueren TO service_role;


--
-- Name: TABLE tagesbericht_vorlagen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tagesbericht_vorlagen TO anon;
GRANT ALL ON TABLE public.tagesbericht_vorlagen TO authenticated;
GRANT ALL ON TABLE public.tagesbericht_vorlagen TO service_role;


--
-- Name: TABLE tagesberichte; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tagesberichte TO anon;
GRANT ALL ON TABLE public.tagesberichte TO authenticated;
GRANT ALL ON TABLE public.tagesberichte TO service_role;


--
-- Name: TABLE termine; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.termine TO anon;
GRANT ALL ON TABLE public.termine TO authenticated;
GRANT ALL ON TABLE public.termine TO service_role;


--
-- Name: TABLE ticket_formular_felder; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_formular_felder TO anon;
GRANT ALL ON TABLE public.ticket_formular_felder TO authenticated;
GRANT ALL ON TABLE public.ticket_formular_felder TO service_role;


--
-- Name: TABLE ticket_formulare; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ticket_formulare TO anon;
GRANT ALL ON TABLE public.ticket_formulare TO authenticated;
GRANT ALL ON TABLE public.ticket_formulare TO service_role;


--
-- Name: TABLE unternehmen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.unternehmen TO anon;
GRANT ALL ON TABLE public.unternehmen TO authenticated;
GRANT ALL ON TABLE public.unternehmen TO service_role;


--
-- Name: TABLE zeiterfassung; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.zeiterfassung TO anon;
GRANT ALL ON TABLE public.zeiterfassung TO authenticated;
GRANT ALL ON TABLE public.zeiterfassung TO service_role;


--
-- PostgreSQL database dump complete
--



insert into private.schema_migrationen (name)
values ('0000_rollen_auth_storage.sql'), ('0001_basis.sql')
on conflict do nothing;
