-- Materialstamm um Hersteller und Artikelnummer erweitern, damit bei der
-- Materialauswahl an einer Aufgabe eindeutig nachbestellt werden kann.
-- Beide Felder optional, da Bestandsdaten ohne diese Angabe gueltig bleiben.

alter table public.material_stamm add column hersteller text;
alter table public.material_stamm add column artikelnummer text;
