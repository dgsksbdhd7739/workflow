-- Waende 1:1 und Fenster eines Geschosses aus dem Grundriss-Plan
-- (src/lib/planAnalyse.ts), Meter im Gebaeude-Koordinatensystem:
-- waende:  { "aufloesung": 0.05, "x0": -41.2, "z0": -13.7, "rechtecke": [x, z, breite, tiefe, ...] }
--          (Rechtecke in Rasterzellen; Tuer- und Fensteroeffnungen sind Luecken)
-- fenster: [{ "x": 1.2, "z": -13.5, "breite": 1.4, "tiefe": 0.45, "winkel": 0 | 90 }]

alter table public.geschosse
  add column if not exists waende jsonb,
  add column if not exists fenster jsonb;

insert into private.schema_migrationen (name)
values ('0010_geschoss_waende_fenster.sql')
on conflict do nothing;
