-- Tueren eines Geschosses aus dem Grundriss-Plan (src/lib/planAnalyse.ts):
-- [{ "x": 12.3, "z": -4.1, "breite": 0.9, "winkel": 0 | 90 }]
-- Meter im Gebaeude-Koordinatensystem wie geschosse.grundriss; winkel ist die
-- Richtung der Wand, in der die Tuer sitzt (0 = entlang x, 90 = entlang z).

alter table public.geschosse
  add column if not exists tueren jsonb;

insert into private.schema_migrationen (name)
values ('0009_geschoss_tueren.sql')
on conflict do nothing;
