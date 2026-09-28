-- Konfigurierbare Tagesbericht-Vorlagen (PlanRadar-Vergleich, TODO.md
-- 2026-09-28, Punkt 7). Neben einer firmenweiten Vorlage (Name, Standard)
-- kann optional eine eigene PDF-Datei mit ausfuellbaren Formularfeldern
-- hochgeladen werden -- ist keine hinterlegt, bleibt es beim bisherigen
-- fest programmierten jsPDF-Layout (siehe src/lib/pdf.ts).

create table public.tagesbericht_vorlagen (
  id uuid primary key default gen_random_uuid(),
  unternehmen_id uuid not null references public.unternehmen(id) on delete cascade default public.current_unternehmen_id(),
  name text not null,
  ist_standard boolean not null default false,
  pdf_datei_pfad text,
  erstellt_von uuid not null references public.profiles(id),
  erstellt_am timestamptz not null default now()
);

create index tagesbericht_vorlagen_unternehmen_idx on public.tagesbericht_vorlagen (unternehmen_id);

alter table public.tagesberichte add column vorlage_id uuid references public.tagesbericht_vorlagen(id) on delete set null;

alter table public.tagesbericht_vorlagen enable row level security;

create policy "tagesbericht_vorlagen: eigenes unternehmen lesen"
  on public.tagesbericht_vorlagen for select
  to authenticated
  using (unternehmen_id = public.current_unternehmen_id());

create policy "tagesbericht_vorlagen: admin/planer anlegen"
  on public.tagesbericht_vorlagen for insert
  to authenticated
  with check (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

create policy "tagesbericht_vorlagen: admin/planer aendern"
  on public.tagesbericht_vorlagen for update
  to authenticated
  using (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id())
  with check (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

create policy "tagesbericht_vorlagen: admin/planer loeschen"
  on public.tagesbericht_vorlagen for delete
  to authenticated
  using (public.current_role() in ('admin', 'planer') and unternehmen_id = public.current_unternehmen_id());

-- Privater Storage-Bucket, analog zu dokumente (Migration 0021).

insert into storage.buckets (id, name, public)
values ('tagesbericht-vorlagen', 'tagesbericht-vorlagen', false)
on conflict (id) do nothing;

create policy "tagesbericht-vorlagen-bucket: eingeloggte Nutzer lesen"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'tagesbericht-vorlagen');

create policy "tagesbericht-vorlagen-bucket: admin/planer hochladen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'tagesbericht-vorlagen' and public.current_role() in ('admin', 'planer'));

create policy "tagesbericht-vorlagen-bucket: admin/planer aendern"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'tagesbericht-vorlagen' and public.current_role() in ('admin', 'planer'));

create policy "tagesbericht-vorlagen-bucket: admin/planer loeschen"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'tagesbericht-vorlagen' and public.current_role() in ('admin', 'planer'));
