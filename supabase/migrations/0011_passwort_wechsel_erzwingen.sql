-- Neue Nutzer starten mit einem Standardpasswort (per Admin-Funktion
-- vergeben) und muessen es beim ersten Login aendern. Bestehende
-- Accounts sind davon nicht betroffen.

alter table public.profiles add column muss_passwort_aendern boolean not null default true;

update public.profiles set muss_passwort_aendern = false;
