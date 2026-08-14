-- Kunden (Rolle "kunde") sehen ab jetzt nur noch Projekte, denen sie
-- explizit zugewiesen wurden, statt aller Baustellen. Admin/Planer/
-- Techniker sind von dieser Einschraenkung nicht betroffen.

create table public.baustelle_kunden (
  baustelle_id uuid not null references public.baustellen(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  primary key (baustelle_id, user_id)
);

alter table public.baustelle_kunden enable row level security;

create policy "baustelle_kunden: admin/planer lesen"
  on public.baustelle_kunden for select
  to authenticated
  using (public.current_role() in ('admin', 'planer'));

create policy "baustelle_kunden: admin/planer anlegen"
  on public.baustelle_kunden for insert
  to authenticated
  with check (public.current_role() in ('admin', 'planer'));

create policy "baustelle_kunden: admin/planer loeschen"
  on public.baustelle_kunden for delete
  to authenticated
  using (public.current_role() in ('admin', 'planer'));

-- Hilfsfunktion: hat der aktuelle Nutzer Zugriff auf diese Baustelle?
-- Fuer alle Rollen ausser "kunde" immer true; fuer "kunde" nur bei
-- expliziter Zuweisung in baustelle_kunden.
create or replace function public.kunde_hat_zugriff(p_baustelle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_role() is distinct from 'kunde'
    or exists (
      select 1 from public.baustelle_kunden bk
      where bk.baustelle_id = p_baustelle_id and bk.user_id = auth.uid()
    )
$$;

-- Bestehende "alle lesen"-Policies durch zugriffsgepruefte ersetzen ------

drop policy if exists "baustellen: alle lesen" on public.baustellen;
create policy "baustellen: zugriffsberechtigte lesen" on public.baustellen for select to authenticated using (public.kunde_hat_zugriff(id));

drop policy if exists "maengel: alle lesen" on public.maengel;
create policy "maengel: zugriffsberechtigte lesen" on public.maengel for select to authenticated using (public.kunde_hat_zugriff(baustelle_id));

drop policy if exists "plaene: alle lesen" on public.plaene;
create policy "plaene: zugriffsberechtigte lesen" on public.plaene for select to authenticated using (public.kunde_hat_zugriff(baustelle_id));

drop policy if exists "tagesberichte: alle lesen" on public.tagesberichte;
create policy "tagesberichte: zugriffsberechtigte lesen" on public.tagesberichte for select to authenticated using (public.kunde_hat_zugriff(baustelle_id));

drop policy if exists "termine: alle lesen" on public.termine;
create policy "termine: zugriffsberechtigte lesen" on public.termine for select to authenticated using (public.kunde_hat_zugriff(baustelle_id));

drop policy if exists "mangel_phasen: alle lesen" on public.mangel_phasen;
create policy "mangel_phasen: zugriffsberechtigte lesen" on public.mangel_phasen for select to authenticated using (
  exists (select 1 from public.maengel m where m.id = mangel_phasen.mangel_id and public.kunde_hat_zugriff(m.baustelle_id))
);

drop policy if exists "mangel_kommentare: alle lesen" on public.mangel_kommentare;
create policy "mangel_kommentare: zugriffsberechtigte lesen" on public.mangel_kommentare for select to authenticated using (
  exists (select 1 from public.maengel m where m.id = mangel_kommentare.mangel_id and public.kunde_hat_zugriff(m.baustelle_id))
);
