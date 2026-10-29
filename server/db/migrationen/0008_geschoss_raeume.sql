-- Raeume eines Geschosses aus dem Grundriss-Plan (src/lib/planAnalyse.ts):
-- [{ "punkte": [[x, z], ...], "nr": "301.20" | null, "einheit": "301" | null, "flaeche": 23.4 }]
-- Meter im Gebaeude-Koordinatensystem wie geschosse.grundriss. "einheit" ist
-- der Name der zugehoerigen Einheit (einheiten.name) auf diesem Geschoss.

alter table public.geschosse
  add column if not exists raeume jsonb;

insert into private.schema_migrationen (name)
values ('0008_geschoss_raeume.sql')
on conflict do nothing;
