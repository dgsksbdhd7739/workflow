-- Geschosse und Einheiten (Wohnungen/Gewerbe/Technik) je Gebaeude als
-- Grundlage der 3D-Gebaeudeansicht. Fortschritt/Status wird NICHT
-- gespeichert, sondern aus den zugeordneten Aufgaben und Terminen berechnet.
--
-- Jede Zeile traegt zusaetzlich projekt_id; zusammengesetzte Fremdschluessel
-- (id, projekt_id) erzwingen, dass sie zum Projekt des uebergeordneten
-- Gebaeudes/Geschosses gehoert. Dadurch genuegen dieselben Projekt-Policies
-- wie bei gebaeude, und eine Zuordnung ueber Projekt-/Firmengrenzen ist
-- schon auf Schema-Ebene unmoeglich.

alter table public.gebaeude add constraint gebaeude_id_projekt_eindeutig unique (id, projekt_id);

-- Lage und Grundriss fuer die 3D-Ansichten (Meter, Baustellen-Koordinaten).
-- Ohne Angabe ordnet die Oberflaeche die Gebaeude automatisch an.
alter table public.gebaeude
  add column lage_x numeric,
  add column lage_z numeric,
  add column breite_m numeric not null default 24 check (breite_m between 4 and 300),
  add column tiefe_m numeric not null default 14 check (tiefe_m between 4 and 300),
  add column drehung_grad numeric not null default 0 check (drehung_grad between -360 and 360);

create table public.geschosse (
  id uuid primary key default gen_random_uuid(),
  gebaeude_id uuid not null,
  projekt_id uuid not null,
  -- Anzeige, z. B. "UG", "EG", "OG 3", "DG"
  name text not null check (char_length(trim(name)) between 1 and 40),
  -- Reihenfolge von unten nach oben: -1 = UG, 0 = EG, 1 = OG 1 ...
  ebene integer not null check (ebene between -10 and 200),
  hoehe_m numeric not null default 3 check (hoehe_m between 2 and 20),
  erstellt_am timestamptz not null default now(),
  unique (gebaeude_id, ebene),
  unique (id, projekt_id),
  foreign key (gebaeude_id, projekt_id) references public.gebaeude (id, projekt_id) on delete cascade
);
create index geschosse_projekt_idx on public.geschosse (projekt_id);

create table public.einheiten (
  id uuid primary key default gen_random_uuid(),
  geschoss_id uuid not null,
  projekt_id uuid not null,
  -- Anzeige, z. B. "Whg 3.2", "Laden 1", "Technik"
  name text not null check (char_length(trim(name)) between 1 and 60),
  art text not null default 'wohnung' check (art in ('wohnung', 'gewerbe', 'technik', 'allgemein', 'sonstiges')),
  flaeche_m2 numeric check (flaeche_m2 is null or flaeche_m2 > 0),
  -- Position innerhalb des Geschosses (links nach rechts, vorne nach hinten)
  reihenfolge integer not null default 0,
  erstellt_am timestamptz not null default now(),
  unique (id, projekt_id),
  foreign key (geschoss_id, projekt_id) references public.geschosse (id, projekt_id) on delete cascade
);
create index einheiten_geschoss_idx on public.einheiten (geschoss_id);
create index einheiten_projekt_idx on public.einheiten (projekt_id);

alter table public.geschosse enable row level security;
alter table public.einheiten enable row level security;

create policy "geschosse: projektberechtigte lesen" on public.geschosse for select to authenticated
  using (public.kunde_hat_zugriff(projekt_id));
create policy "geschosse: admin und planer anlegen" on public.geschosse for insert to authenticated
  with check (public.current_role() in ('admin', 'planer') and public.projekt_im_eigenen_unternehmen(projekt_id));
create policy "geschosse: admin und planer aendern" on public.geschosse for update to authenticated
  using (public.current_role() in ('admin', 'planer') and public.projekt_im_eigenen_unternehmen(projekt_id))
  with check (public.current_role() in ('admin', 'planer') and public.projekt_im_eigenen_unternehmen(projekt_id));
create policy "geschosse: admin und planer loeschen" on public.geschosse for delete to authenticated
  using (public.current_role() in ('admin', 'planer') and public.projekt_im_eigenen_unternehmen(projekt_id));

create policy "einheiten: projektberechtigte lesen" on public.einheiten for select to authenticated
  using (public.kunde_hat_zugriff(projekt_id));
create policy "einheiten: admin und planer anlegen" on public.einheiten for insert to authenticated
  with check (public.current_role() in ('admin', 'planer') and public.projekt_im_eigenen_unternehmen(projekt_id));
create policy "einheiten: admin und planer aendern" on public.einheiten for update to authenticated
  using (public.current_role() in ('admin', 'planer') and public.projekt_im_eigenen_unternehmen(projekt_id))
  with check (public.current_role() in ('admin', 'planer') and public.projekt_im_eigenen_unternehmen(projekt_id));
create policy "einheiten: admin und planer loeschen" on public.einheiten for delete to authenticated
  using (public.current_role() in ('admin', 'planer') and public.projekt_im_eigenen_unternehmen(projekt_id));

-- Aufgaben und Termine optional einem Bereich zuordnen -- immer nur der
-- genaueste (Einheit ODER Geschoss ODER Gebaeude), der Rest ergibt sich ueber
-- die Hierarchie. Beim Loeschen des Bereichs bleibt die Aufgabe/der Termin
-- erhalten, nur die Zuordnung faellt weg (SET NULL nur fuer die Bereichs-Spalte).
alter table public.aufgaben
  add column gebaeude_id uuid,
  add column geschoss_id uuid,
  add column einheit_id uuid,
  add constraint aufgaben_ein_bereich check (num_nonnulls(gebaeude_id, geschoss_id, einheit_id) <= 1),
  add constraint aufgaben_gebaeude_fk foreign key (gebaeude_id, projekt_id)
    references public.gebaeude (id, projekt_id) on delete set null (gebaeude_id),
  add constraint aufgaben_geschoss_fk foreign key (geschoss_id, projekt_id)
    references public.geschosse (id, projekt_id) on delete set null (geschoss_id),
  add constraint aufgaben_einheit_fk foreign key (einheit_id, projekt_id)
    references public.einheiten (id, projekt_id) on delete set null (einheit_id);

alter table public.termine
  add column gebaeude_id uuid,
  add column geschoss_id uuid,
  add column einheit_id uuid,
  add constraint termine_ein_bereich check (num_nonnulls(gebaeude_id, geschoss_id, einheit_id) <= 1),
  add constraint termine_gebaeude_fk foreign key (gebaeude_id, projekt_id)
    references public.gebaeude (id, projekt_id) on delete set null (gebaeude_id),
  add constraint termine_geschoss_fk foreign key (geschoss_id, projekt_id)
    references public.geschosse (id, projekt_id) on delete set null (geschoss_id),
  add constraint termine_einheit_fk foreign key (einheit_id, projekt_id)
    references public.einheiten (id, projekt_id) on delete set null (einheit_id);

create index aufgaben_einheit_idx on public.aufgaben (einheit_id) where einheit_id is not null;
create index aufgaben_geschoss_idx on public.aufgaben (geschoss_id) where geschoss_id is not null;
create index aufgaben_gebaeude_idx on public.aufgaben (gebaeude_id) where gebaeude_id is not null;
create index termine_einheit_idx on public.termine (einheit_id) where einheit_id is not null;
create index termine_geschoss_idx on public.termine (geschoss_id) where geschoss_id is not null;
create index termine_gebaeude_idx on public.termine (gebaeude_id) where gebaeude_id is not null;

insert into private.schema_migrationen (name)
values ('0005_geschosse_einheiten.sql')
on conflict do nothing;
