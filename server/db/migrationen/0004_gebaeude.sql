-- Gebäudestammdaten je Projekt (Stand Supabase-Migration 0060).
-- Gebäudestammdaten je Projekt als erster Schritt zur interaktiven
-- Baustellenübersicht. Geschosse und Einheiten werden später separat ergänzt.
create table public.gebaeude (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  adresse text,
  beschreibung text,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

create index gebaeude_projekt_idx on public.gebaeude (projekt_id);
alter table public.gebaeude enable row level security;

create policy "gebaeude: projektberechtigte lesen"
  on public.gebaeude for select
  to authenticated
  using (public.kunde_hat_zugriff(projekt_id));

create policy "gebaeude: admin und planer anlegen"
  on public.gebaeude for insert
  to authenticated
  with check (
    public.current_role() in ('admin', 'planer')
    and public.projekt_im_eigenen_unternehmen(projekt_id)
  );

create policy "gebaeude: admin und planer aendern"
  on public.gebaeude for update
  to authenticated
  using (
    public.current_role() in ('admin', 'planer')
    and public.projekt_im_eigenen_unternehmen(projekt_id)
  )
  with check (
    public.current_role() in ('admin', 'planer')
    and public.projekt_im_eigenen_unternehmen(projekt_id)
  );

create policy "gebaeude: admin und planer loeschen"
  on public.gebaeude for delete
  to authenticated
  using (
    public.current_role() in ('admin', 'planer')
    and public.projekt_im_eigenen_unternehmen(projekt_id)
  );

-- Uebernommen aus supabase/migrations/0060_gebaeude.sql (wurde dort nie
-- eingespielt, weil das Supabase-Projekt bereits pausiert war). Supabase gab
-- neuen Tabellen ueber Default Privileges automatisch Rechte; hier explizit:
grant all on public.gebaeude to authenticated, service_role;

-- Damit kuenftige Migrationen (als postgres ausgefuehrt) dasselbe Verhalten
-- haben wie unter Supabase. Der Zugriff wird weiterhin von RLS begrenzt; die
-- Daten-API gibt ohnehin nur Tabellen mit aktivem RLS frei.
alter default privileges for role postgres in schema public
  grant all on tables to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to authenticated, service_role;

insert into private.schema_migrationen (name)
values ('0004_gebaeude.sql')
on conflict do nothing;
