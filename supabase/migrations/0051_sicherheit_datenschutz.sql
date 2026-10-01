-- Sicherheits-/Datenschutz-Einstellungen (PlanRadar-Vergleich 2026-10-01,
-- Profil-Unterpunkte "Privatsphaere Einstellungen" und "Angemeldete
-- Geraete"). Bewusst anders umgesetzt als dort gesehen: statt eines
-- Marketing-Einwilligungsformulars ein einzelner echter Schalter fuer die
-- wiederkehrenden "Was ist neu"-Popups (0051: produkt_hinweise), und statt
-- einer serverseitigen Geraete-/Session-Tabelle eine eigene, clientseitig
-- gefuehrte Geraete-Liste je Nutzer (Supabase erlaubt kein gezieltes
-- Abmelden einzelner fremder Sessions client-seitig -- nur global/alle
-- anderen ueber auth.signOut({scope: 'others'})).
--
-- Zwei-Faktor-Authentifizierung braucht keine eigene Tabelle: Supabase Auth
-- verwaltet TOTP-Faktoren bereits intern (auth.mfa_factors).

alter table public.profiles add column produkt_hinweise boolean not null default true;

create table public.nutzer_sitzungen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  geraet_kennung text not null,
  geraet_name text not null,
  letzter_zugriff timestamptz not null default now(),
  erstellt_am timestamptz not null default now(),
  unique (user_id, geraet_kennung)
);

create index nutzer_sitzungen_user_idx on public.nutzer_sitzungen (user_id);

alter table public.nutzer_sitzungen enable row level security;

create policy "nutzer_sitzungen: eigene lesen"
  on public.nutzer_sitzungen for select
  to authenticated
  using (user_id = auth.uid());

create policy "nutzer_sitzungen: eigene anlegen"
  on public.nutzer_sitzungen for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "nutzer_sitzungen: eigene aktualisieren"
  on public.nutzer_sitzungen for update
  to authenticated
  using (user_id = auth.uid());

create policy "nutzer_sitzungen: eigene loeschen"
  on public.nutzer_sitzungen for delete
  to authenticated
  using (user_id = auth.uid());
