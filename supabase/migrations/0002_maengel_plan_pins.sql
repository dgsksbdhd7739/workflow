-- Maengel als Plan-Markierungen: manuelle Farbe pro Mangel und Ablösung
-- der bisher ungenutzten plan_markierungen-Tabelle. Mängel tragen bereits
-- plan_id/position_x/position_y (seit 0001) und dienen jetzt direkt als
-- Pins auf dem Plan.

alter table public.maengel add column farbe text;

drop table if exists public.plan_markierungen;
