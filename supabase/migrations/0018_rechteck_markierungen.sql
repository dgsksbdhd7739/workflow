-- Zweiter Eckpunkt fuer rechteckige Markierungen (z. B. Tueren) auf einem
-- Plan. Ist position_x2/position_y2 gesetzt, wird die Markierung als
-- Rechteck zwischen (position_x, position_y) und (position_x2, position_y2)
-- gerendert statt als einzelner Pin.

alter table public.maengel add column position_x2 double precision;
alter table public.maengel add column position_y2 double precision;
