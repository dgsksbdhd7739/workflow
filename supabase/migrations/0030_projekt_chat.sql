-- Projekt-Chat: zusaetzlich zum unternehmensweiten Team-Chat ein Chat je
-- Baustelle, damit sich Absprachen auf ein konkretes Projekt beziehen
-- lassen. Gleiche Zugriffslogik wie bei anderen baustellenbezogenen
-- Tabellen (kunde_hat_zugriff) und wie beim Team-Chat ohne Kundenrolle.

create table public.projekt_chat_nachrichten (
  id uuid primary key default gen_random_uuid(),
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  erstellt_am timestamptz not null default now()
);

create index projekt_chat_baustelle_zeit_idx on public.projekt_chat_nachrichten (baustelle_id, erstellt_am);

alter table public.projekt_chat_nachrichten enable row level security;

create policy "projekt_chat: teammitglieder lesen"
  on public.projekt_chat_nachrichten for select
  to authenticated
  using (public.kunde_hat_zugriff(baustelle_id) and public.current_role() <> 'kunde');

create policy "projekt_chat: teammitglieder schreiben"
  on public.projekt_chat_nachrichten for insert
  to authenticated
  with check (
    public.kunde_hat_zugriff(baustelle_id)
    and user_id = auth.uid()
    and public.current_role() <> 'kunde'
  );

create policy "projekt_chat: eigene Nachricht loeschen"
  on public.projekt_chat_nachrichten for delete
  to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.projekt_chat_nachrichten;
