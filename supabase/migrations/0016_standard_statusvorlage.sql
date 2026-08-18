-- Feste Standard-Fortschrittsstufen (Montage, Verdrahtung FSA/DTA/RMZ,
-- Inbetriebnahme, Abnahme), die jedem neu hochgeladenen Plan automatisch
-- zugewiesen werden -- ohne manuellen Zwischenschritt. Admin/Planer koennen
-- weiterhin eigene Fortschrittspunkte ergaenzen oder eigene Vorlagen anlegen
-- (siehe Statusvorlagen-Seite). Nur "Abnahme" ist standardmaessig gruen.

alter table public.statusvorlagen add column ist_standard boolean not null default false;

do $$
declare
  v_vorlage_id uuid;
  v_ersteller_id uuid;
begin
  select id into v_ersteller_id from public.profiles where role = 'admin' order by created_at limit 1;
  if v_ersteller_id is null then
    select id into v_ersteller_id from public.profiles order by created_at limit 1;
  end if;

  if v_ersteller_id is null then
    return;
  end if;

  insert into public.statusvorlagen (name, ist_standard, erstellt_von)
  values ('Standard', true, v_ersteller_id)
  returning id into v_vorlage_id;

  insert into public.statusvorlage_werte (statusvorlage_id, titel, farbe, reihenfolge, ist_standard)
  values
    (v_vorlage_id, 'Montage', '#dc2626', 1, true),
    (v_vorlage_id, 'Verdrahtung FSA', '#ea580c', 2, false),
    (v_vorlage_id, 'Verdrahtung DTA', '#f59e0b', 3, false),
    (v_vorlage_id, 'Verdrahtung RMZ', '#eab308', 4, false),
    (v_vorlage_id, 'Inbetriebnahme', '#2563eb', 5, false),
    (v_vorlage_id, 'Abnahme', '#16a34a', 6, false);
end $$;
