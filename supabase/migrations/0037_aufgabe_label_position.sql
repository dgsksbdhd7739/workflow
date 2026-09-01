-- Punkt-Markierungen: der Kasten (Titel-Label) kann beim Anlegen frei neben
-- die eigentliche Stelle auf dem Plan gesetzt werden (2-Klick-Platzierung in
-- PlanDetail.tsx), damit sich Labels bei eng beieinanderliegenden Punkten
-- nicht ueberlappen. position_x/position_y bleiben die praezise, tatsaechliche
-- Stelle (z.B. fuer die OCR-Duplikaterkennung weiterhin relevant) -- label_x/
-- label_y sind NULL, solange kein Label-Versatz gesetzt wurde (Standardfall,
-- Label sitzt direkt ueber der Stelle wie bisher).
alter table public.aufgaben add column if not exists label_x numeric;
alter table public.aufgaben add column if not exists label_y numeric;
