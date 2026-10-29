-- 1) Mehrseitige PDF-Plaene: Ein Plan zeigt eine bestimmte Seite seiner Datei.
--    Mehrere Plaene duerfen dieselbe Datei nutzen (z. B. ein Satz Grundrisse
--    EG bis 6.OG als eine PDF, je Geschoss ein Plan-Eintrag mit eigener Seite).
-- 2) Geschosse/Einheiten aus Plaenen: echter Grundriss-Umriss, Lage des
--    Planbilds und Position der Einheiten (alles in Metern im Koordinaten-
--    system des Gebaeudes: x nach rechts, z nach unten wie auf dem Plan).

alter table public.plaene
  add column if not exists seite integer not null default 1 check (seite >= 1);

alter table public.geschosse
  add column if not exists plan_id uuid references public.plaene (id) on delete set null,
  add column if not exists plan_seite integer check (plan_seite >= 1),
  -- [[x, z], ...] Aussenumriss in Metern
  add column if not exists grundriss jsonb,
  -- Gerendertes Grundrissbild (Bucket plaene) und seine Lage in Metern
  add column if not exists plan_bild_pfad text,
  add column if not exists plan_bild_lage jsonb,
  add column if not exists massstab integer check (massstab > 0);

alter table public.einheiten
  add column if not exists lage_x numeric,
  add column if not exists lage_z numeric;

create index if not exists geschosse_plan_id on public.geschosse (plan_id);

insert into private.schema_migrationen (name)
values ('0007_plaene_seiten_grundrisse.sql')
on conflict do nothing;
