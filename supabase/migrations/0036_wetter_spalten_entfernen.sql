-- Wetterfunktion wurde aus der App entfernt (kein Wetterabruf, keine
-- Wetteranzeige mehr, siehe TODO.md). Die Spalten standen seitdem ungenutzt
-- in tagesberichte -- wird jetzt final aufgeraeumt. Historische Wetterwerte
-- vergangener Tagesberichte gehen dabei unwiderruflich verloren.

alter table public.tagesberichte drop column if exists wetter;
alter table public.tagesberichte drop column if exists temperatur;
