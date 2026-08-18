-- Supabase erlaubt kein "alter database ... set app.settings.xyz" ueber
-- normale Client-Verbindungen (permission denied). Als Ersatz fuer den per
-- current_setting() gelesenen Trigger-Secret/Edge-URL: eine private Tabelle,
-- die nur serverseitig (SECURITY DEFINER-Funktion) gelesen wird und nicht
-- ueber PostgREST erreichbar ist (eigenes Schema, kein "public").

create schema if not exists private;

create table private.app_settings (
  key text primary key,
  value text not null
);

revoke all on private.app_settings from anon, authenticated;

create or replace function public.notify_chat_nachricht()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, private
as $$
declare
  edge_url text;
  trigger_secret text;
begin
  select value into edge_url from private.app_settings where key = 'edge_url';
  select value into trigger_secret from private.app_settings where key = 'chat_push_secret';
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
