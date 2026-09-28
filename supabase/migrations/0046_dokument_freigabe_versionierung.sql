-- Dokument-Freigabe-Workflow + einfache Versionierung (PlanRadar-Vergleich,
-- TODO.md 2026-09-28, Punkt 5).
--
-- Versionierung: ein neuer Upload "als neue Version" legt eine GANZ NORMALE
-- neue dokumente-Zeile an, die per vorgaenger_id auf die alte Zeile zeigt --
-- keine separate Storage-Struktur noetig, die alte Datei bleibt unveraendert
-- erhalten (Audit-Trail), nur die Liste zeigt standardmaessig nur die
-- jeweils neueste Version einer Kette.
--
-- Freigabe: ein einzelnes Statusfeld auf dokumente fuer die schnelle
-- Filterung/Anzeige, plus eine Historientabelle dokument_freigaben fuer
-- "wer hat wann angefordert/entschieden" (mehrere Anforderungen ueber die
-- Zeit moeglich, z. B. nach Ablehnung erneut angefordert).

alter table public.dokumente
  add column freigabestatus text not null default 'keine_anforderung'
    check (freigabestatus in ('keine_anforderung', 'angefordert', 'freigegeben', 'abgelehnt')),
  add column vorgaenger_id uuid references public.dokumente(id) on delete set null;

create table public.dokument_freigaben (
  id uuid primary key default gen_random_uuid(),
  dokument_id uuid not null references public.dokumente(id) on delete cascade,
  status text not null check (status in ('angefordert', 'freigegeben', 'abgelehnt')),
  kommentar text,
  angefordert_von uuid not null references public.profiles(id),
  angefordert_am timestamptz not null default now(),
  entschieden_von uuid references public.profiles(id),
  entschieden_am timestamptz
);

create index dokument_freigaben_dokument_idx on public.dokument_freigaben (dokument_id);

alter table public.dokument_freigaben enable row level security;

-- Lesen: wie das zugehoerige Dokument (inkl. Modul-Sperre "dokumente").
create policy "dokument_freigaben: zugriffsberechtigte lesen"
  on public.dokument_freigaben for select
  to authenticated
  using (
    exists (
      select 1 from public.dokumente d
      where d.id = dokument_freigaben.dokument_id
        and public.kunde_hat_zugriff(d.projekt_id)
        and public.hat_modul_zugriff('dokumente')
    )
  );

-- Anfordern: wie das Bearbeiten von Dokumenten (admin/planer/techniker),
-- nicht der Kunde -- Freigabe ist ein internes Qualitaets-Gate.
create policy "dokument_freigaben: schreibberechtigte anfordern"
  on public.dokument_freigaben for insert
  to authenticated
  with check (
    status = 'angefordert'
    and public.current_role() in ('admin', 'planer', 'techniker')
    and public.hat_modul_zugriff('dokumente')
    and exists (
      select 1 from public.dokumente d
      where d.id = dokument_freigaben.dokument_id and public.projekt_im_eigenen_unternehmen(d.projekt_id)
    )
  );

-- Entscheiden (freigeben/ablehnen): nur admin/planer.
create policy "dokument_freigaben: admin/planer entscheiden"
  on public.dokument_freigaben for update
  to authenticated
  using (
    public.current_role() in ('admin', 'planer')
    and exists (
      select 1 from public.dokumente d
      where d.id = dokument_freigaben.dokument_id and public.projekt_im_eigenen_unternehmen(d.projekt_id)
    )
  )
  with check (
    public.current_role() in ('admin', 'planer')
    and status in ('freigegeben', 'abgelehnt')
  );
