-- Profil-Kontaktfelder (PlanRadar-Vergleich 2026-10-01, Punkt 3: "Profil &
-- persoenliche Einstellungen"). Nutzer koennen diese bereits dank der
-- bestehenden Policy "profiles: Nutzer kann eigenes Profil aktualisieren"
-- (0001_init.sql) selbst pflegen -- keine neue RLS-Policy noetig.

alter table public.profiles add column telefon text;
alter table public.profiles add column positionsbezeichnung text;
alter table public.profiles add column strasse text;
alter table public.profiles add column plz text;
alter table public.profiles add column stadt text;
