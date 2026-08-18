-- Unternehmensweite Materialstammdaten, unabhaengig von einzelnen Projekten.
-- admin/planer legen hier feste Materialien an; beim Zuordnen von Material
-- zu einer Aufgabe (mangel_material) kann daraus ausgewaehlt werden, statt
-- jedes Mal Freitext einzugeben. Techniker duerfen die Stammdaten weder
-- lesen noch bearbeiten (sie ordnen kein Material zu, sondern bestaetigen
-- nur bereits zugeordnetes Material als verbaut).

create table public.material_stamm (
  id uuid primary key default gen_random_uuid(),
  unternehmen_id uuid not null references public.unternehmen(id) on delete cascade,
  bezeichnung text not null,
  einheit text,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

create index material_stamm_unternehmen_idx on public.material_stamm (unternehmen_id);

alter table public.material_stamm enable row level security;

create policy "material_stamm: admin/planer lesen"
  on public.material_stamm for select
  to authenticated
  using (unternehmen_id = public.current_unternehmen_id() and public.current_role() in ('admin', 'planer'));

create policy "material_stamm: admin/planer anlegen"
  on public.material_stamm for insert
  to authenticated
  with check (unternehmen_id = public.current_unternehmen_id() and public.current_role() in ('admin', 'planer'));

create policy "material_stamm: admin/planer aendern"
  on public.material_stamm for update
  to authenticated
  using (unternehmen_id = public.current_unternehmen_id() and public.current_role() in ('admin', 'planer'));

create policy "material_stamm: admin/planer loeschen"
  on public.material_stamm for delete
  to authenticated
  using (unternehmen_id = public.current_unternehmen_id() and public.current_role() in ('admin', 'planer'));

-- Rueckverfolgung: aus welchem Stammdatensatz ein Materialposten an einer
-- Aufgabe stammt. Bezeichnung/Einheit bleiben zusaetzlich denormalisiert
-- auf mangel_material, damit bestehende Eintraege gueltig bleiben, auch
-- wenn der Stammdatensatz spaeter geaendert oder geloescht wird.
alter table public.mangel_material
  add column material_stamm_id uuid references public.material_stamm(id) on delete set null;
