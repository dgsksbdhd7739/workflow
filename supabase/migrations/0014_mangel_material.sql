-- Materialliste je Mangel/Aufgabe (= gesetzter Punkt auf einem Plan).
-- Admin/Planer legen im Vorfeld fest, welches Material benoetigt wird;
-- Techniker haken es beim Verbauen ab; Kunden sehen die Liste nur.

create table public.mangel_material (
  id uuid primary key default gen_random_uuid(),
  mangel_id uuid not null references public.maengel(id) on delete cascade,
  bezeichnung text not null,
  menge numeric not null default 1,
  einheit text,
  erledigt boolean not null default false,
  reihenfolge integer not null default 0,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

alter table public.mangel_material enable row level security;

create policy "mangel_material: zugriffsberechtigte lesen"
  on public.mangel_material for select
  to authenticated
  using (
    exists (
      select 1 from public.maengel m
      where m.id = mangel_material.mangel_id and public.kunde_hat_zugriff(m.baustelle_id)
    )
  );

create policy "mangel_material: admin/planer anlegen"
  on public.mangel_material for insert
  to authenticated
  with check (public.current_role() in ('admin', 'planer'));

create policy "mangel_material: admin/planer/techniker aendern"
  on public.mangel_material for update
  to authenticated
  using (public.current_role() in ('admin', 'planer', 'techniker'));

create policy "mangel_material: admin/planer loeschen"
  on public.mangel_material for delete
  to authenticated
  using (public.current_role() in ('admin', 'planer'));

-- Techniker duerfen nur den Erledigt-Status abhaken. Die Materialdefinition
-- (Bezeichnung/Menge/Einheit/Reihenfolge) bleibt Admin/Planer vorbehalten,
-- auch wenn sie technisch ueber dieselbe Update-Policy schreiben duerfen.
create or replace function public.protect_material_definition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.current_role() not in ('admin', 'planer') then
    new.bezeichnung := old.bezeichnung;
    new.menge := old.menge;
    new.einheit := old.einheit;
    new.reihenfolge := old.reihenfolge;
    new.mangel_id := old.mangel_id;
  end if;
  return new;
end;
$$;

create trigger protect_material_definition_before_update
  before update on public.mangel_material
  for each row execute procedure public.protect_material_definition();
