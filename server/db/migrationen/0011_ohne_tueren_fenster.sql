-- Tuer- und Fenstererkennung aus Plaenen entfernt (Wunsch des Nutzers, 2.9.0):
-- Die 3D-Waende zeigen nur noch, was im Plan gezeichnet ist; Oeffnungen bleiben
-- Luecken. Die abgeleiteten Daten werden nicht mehr gebraucht.

alter table public.geschosse
  drop column if exists tueren,
  drop column if exists fenster;

insert into private.schema_migrationen (name)
values ('0011_ohne_tueren_fenster.sql')
on conflict do nothing;
