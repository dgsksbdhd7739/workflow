-- Ergaenzungen zu 0054 (Plattform-Admin bearbeitet fremde Firmen).

-- Logo-Vorschau einer fremden Firma (Signed URL) braucht auch Leserecht.
drop policy if exists "unternehmen-logos: zugriffsberechtigte lesen" on storage.objects;
create policy "unternehmen-logos: zugriffsberechtigte lesen"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'unternehmen-logos'
    and (public.unternehmen_ordner_erlaubt(name) or public.ist_plattform_admin())
  );

-- Nutzerlimit darf nur der Plattform-Admin (oder der Service-Role-Pfad der
-- Edge Functions, auth.uid() = null) aendern. Ohne diesen Schutz koennte
-- ein normaler Firmen-Admin ueber die bestehende Update-Policy aus 0028
-- sein eigenes max_nutzer hochsetzen und das Limit umgehen.
create or replace function public.unternehmen_max_nutzer_schuetzen()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.max_nutzer is distinct from old.max_nutzer
     and auth.uid() is not null
     and not public.ist_plattform_admin() then
    raise exception 'Nur Plattform-Admins duerfen das Nutzerlimit aendern'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger unternehmen_max_nutzer_schuetzen
  before update on public.unternehmen
  for each row execute function public.unternehmen_max_nutzer_schuetzen();
