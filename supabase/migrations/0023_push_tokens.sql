-- Speichert FCM-Geraetetoken je Nutzer, um Push-Benachrichtigungen
-- (z. B. neue Team-Chat-Nachricht) serverseitig ueber die
-- send-chat-push-Edge-Function verschicken zu koennen.

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  plattform text not null default 'android',
  erstellt_am timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "push_tokens: eigene lesen" on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy "push_tokens: eigene anlegen" on public.push_tokens for insert to authenticated with check (user_id = auth.uid());
create policy "push_tokens: eigene loeschen" on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- Bei neuer Chat-Nachricht die send-chat-push-Edge-Function ueber pg_net
-- anstossen (asynchroner HTTP-Call, blockiert den Insert nicht). Die
-- Function wird mit --no-verify-jwt deployt und prueft stattdessen ein
-- eigenes, zufaellig erzeugtes Trigger-Secret (kein Supabase-Systemschluessel
-- noetig). URL und Secret liegen als DB-Settings:
--   alter database postgres set app.settings.edge_url = 'https://<ref>.supabase.co';
--   alter database postgres set app.settings.chat_push_secret = '<zufaelliger wert>';
-- (identischer Wert wird als Edge-Function-Secret CHAT_PUSH_TRIGGER_SECRET gesetzt.)

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_chat_nachricht()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  edge_url text;
  trigger_secret text;
begin
  edge_url := current_setting('app.settings.edge_url', true);
  trigger_secret := current_setting('app.settings.chat_push_secret', true);
  if edge_url is null or trigger_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := edge_url || '/functions/v1/send-chat-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trigger-secret', trigger_secret),
    body := jsonb_build_object('nachricht_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists on_chat_nachricht_insert on public.chat_nachrichten;
create trigger on_chat_nachricht_insert
  after insert on public.chat_nachrichten
  for each row execute procedure public.notify_chat_nachricht();
