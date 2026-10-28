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
