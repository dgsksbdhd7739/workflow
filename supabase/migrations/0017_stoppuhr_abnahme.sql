-- Automatische Start/Stopp-Zeiterfassung je Punkt (Mangel/Aufgabe): laeuft in
-- derselben Zeiterfassung wie die manuellen Eintraege, nur mit Bezug auf den
-- Punkt, damit sich die Zeit je Punkt aufsummieren laesst (auch ueber mehrere
-- Techniker hinweg) und im Bautagebuch gelistet werden kann.

alter table public.zeiterfassung add column mangel_id uuid references public.maengel(id) on delete set null;

-- Wird ein Punkt auf "Abnahme" gesetzt, muss eine Dokumentations-/Protokollnummer
-- hinterlegt werden.
alter table public.maengel add column abnahme_nummer text;
