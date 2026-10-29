-- Refresh-Token-Rotation mit kurzer Kulanz: Schickt ein Geraet bei wackligem
-- Netz dieselbe Erneuerung zweimal, ist der Vorgaenger-Token noch 30 s
-- gueltig, statt das Geraet abzumelden (Supabase hatte dafuer 10 s).
alter table auth.sitzungen add column if not exists vorheriger_refresh_token_hash text;
create index if not exists sitzungen_vorheriger_hash on auth.sitzungen (vorheriger_refresh_token_hash);

-- Ein TOTP-Code darf nur einmal verwendet werden: der zuletzt akzeptierte
-- 30-s-Zeitschritt wird gemerkt, aeltere/gleiche Schritte werden abgelehnt.
alter table auth.mfa_factors add column if not exists letzter_zeitschritt bigint;

insert into private.schema_migrationen (name)
values ('0002_sitzungen_kulanz_totp_schritt.sql')
on conflict do nothing;
