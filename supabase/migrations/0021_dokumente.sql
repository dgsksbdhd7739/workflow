-- Projekt- und Aufgabendokumente: frei hochladbare Referenzdateien je
-- Baustelle (z. B. Schaltplaene, Kabelschema), optional einer Aufgabe
-- (Markierung) zugeordnet. mangel_id = null => Projektdokument,
-- mangel_id gesetzt => Aufgabendokument.

create table public.dokumente (
  id uuid primary key default gen_random_uuid(),
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  mangel_id uuid references public.maengel(id) on delete set null,
  name text not null,
  datei_pfad text not null,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

create index dokumente_baustelle_idx on public.dokumente (baustelle_id);
create index dokumente_mangel_idx on public.dokumente (mangel_id);

alter table public.dokumente enable row level security;

create policy "dokumente: zugriffsberechtigte lesen" on public.dokumente for select to authenticated using (public.kunde_hat_zugriff(baustelle_id));
create policy "dokumente: schreibberechtigte anlegen" on public.dokumente for insert to authenticated with check (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "dokumente: schreibberechtigte aendern" on public.dokumente for update to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));
create policy "dokumente: schreibberechtigte loeschen" on public.dokumente for delete to authenticated using (public.current_role() in ('admin', 'planer', 'techniker'));

-- Privater Storage-Bucket, analog zu mangel-fotos/plaene (Migration 0007/0012).

insert into storage.buckets (id, name, public)
values ('dokumente', 'dokumente', false)
on conflict (id) do nothing;

create policy "dokumente-bucket: eingeloggte Nutzer lesen"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'dokumente');

create policy "dokumente-bucket: schreibberechtigte hochladen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'dokumente' and public.current_role() in ('admin', 'planer', 'techniker'));

create policy "dokumente-bucket: schreibberechtigte aendern"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'dokumente' and public.current_role() in ('admin', 'planer', 'techniker'));

create policy "dokumente-bucket: schreibberechtigte loeschen"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'dokumente' and public.current_role() in ('admin', 'planer', 'techniker'));
