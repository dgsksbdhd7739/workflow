-- Bereitet Mehrmandantenfaehigkeit vor: jedes Profil gehoert zu einem
-- Unternehmen. Der komplette Bestand (bisher "ein Firmen-Team") wird einem
-- automatisch angelegten Standard-Unternehmen zugeordnet, damit sich am
-- heutigen Verhalten nichts aendert. Neue Registrierungen landen ueber
-- handle_new_user() ebenfalls dort, bis eine echte Unternehmens-Zuordnung
-- beim Onboarding existiert (spaetere Version fuer echten Multi-Tenant-Betrieb).
--
-- Direkter Zweck: der Team-Gruppenchat (chat_nachrichten) ist strikt auf
-- das eigene Unternehmen beschraenkt, damit bei einer spaeteren
-- Veroeffentlichung fuer mehrere Kunden/Firmen keine Chat-Nachrichten
-- unternehmensuebergreifend sichtbar sind.

create table public.unternehmen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  erstellt_am timestamptz not null default now()
);

alter table public.unternehmen enable row level security;

alter table public.profiles add column unternehmen_id uuid references public.unternehmen(id);

do $$
declare
  standard_id uuid;
begin
  insert into public.unternehmen (name) values ('Mein Unternehmen') returning id into standard_id;
  update public.profiles set unternehmen_id = standard_id where unternehmen_id is null;
end $$;

alter table public.profiles alter column unternehmen_id set not null;

-- Hilfsfunktion: Unternehmen des aktuell eingeloggten Nutzers.
create or replace function public.current_unternehmen_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select unternehmen_id from public.profiles where id = auth.uid()
$$;

create policy "unternehmen: eigenes Unternehmen lesen"
  on public.unternehmen for select
  to authenticated
  using (id = public.current_unternehmen_id());

-- Neue Profile (Selbstregistrierung wie auch von der create-user-Function
-- ueber auth.admin.createUser angelegte Nutzer) automatisch dem bisher
-- einzigen Unternehmen zuordnen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  standard_id uuid;
begin
  select id into standard_id from public.unternehmen order by erstellt_am limit 1;
  insert into public.profiles (id, full_name, unternehmen_id)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), standard_id);
  return new;
end;
$$;

-- Gruppenchat --------------------------------------------------------------

create table public.chat_nachrichten (
  id uuid primary key default gen_random_uuid(),
  unternehmen_id uuid not null references public.unternehmen(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  erstellt_am timestamptz not null default now()
);

create index chat_nachrichten_unternehmen_zeit_idx on public.chat_nachrichten (unternehmen_id, erstellt_am);

alter table public.chat_nachrichten enable row level security;

-- Kunden bleiben aussen vor: der Gruppenchat ist fuer das interne Team
-- (admin/planer/techniker), nicht fuer die Kundenrolle.
create policy "chat: teammitglieder lesen"
  on public.chat_nachrichten for select
  to authenticated
  using (unternehmen_id = public.current_unternehmen_id() and public.current_role() <> 'kunde');

create policy "chat: teammitglieder schreiben"
  on public.chat_nachrichten for insert
  to authenticated
  with check (
    unternehmen_id = public.current_unternehmen_id()
    and user_id = auth.uid()
    and public.current_role() <> 'kunde'
  );

create policy "chat: eigene Nachricht loeschen"
  on public.chat_nachrichten for delete
  to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.chat_nachrichten;
