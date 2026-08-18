-- Admins koennen Nutzer deaktivieren (Login sperren), ohne verknuepfte
-- Datensaetze (Plaene, Maengel, Zeiterfassung, ...) durch Loeschen zu
-- verlieren -- viele Nutzer koennen wegen "on delete restrict" auf
-- erstellt_von/verantwortlicher_id ohnehin nicht geloescht werden, sobald
-- sie etwas angelegt haben. Der Login-Sperr-Status wird von der
-- delete-user/set-user-active Edge Function in auth.users (ban_duration)
-- gesetzt; diese Spalte spiegelt ihn fuer die UI.

alter table public.profiles add column deaktiviert boolean not null default false;
