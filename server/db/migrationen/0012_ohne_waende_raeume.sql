-- Wunsch des Nutzers (2.11.0): aus den Plaenen nur noch den Grundumriss je
-- Etage uebernehmen. Innenwaende und Raeume werden nicht mehr erkannt; die
-- abgeleiteten Daten entfallen. Umriss, Planbild und Einheiten bleiben.

alter table public.geschosse
  drop column if exists waende,
  drop column if exists raeume;

insert into private.schema_migrationen (name)
values ('0012_ohne_waende_raeume.sql')
on conflict do nothing;
