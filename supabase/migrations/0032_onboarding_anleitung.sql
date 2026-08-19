-- Merkt sich, ob ein Nutzer die Einfuehrungs-Anleitung (Onboarding-Tutorial)
-- bereits gesehen hat. Neue Nutzer starten mit false, damit ihnen das
-- Tutorial automatisch nach dem ersten Passwort-Wechsel gezeigt wird.
-- Bestehende Accounts gelten als bereits eingefuehrt.

alter table public.profiles add column onboarding_gesehen boolean not null default false;

update public.profiles set onboarding_gesehen = true;
