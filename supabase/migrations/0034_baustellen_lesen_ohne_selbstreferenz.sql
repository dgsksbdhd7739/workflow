-- Bugfix: "new row violates row-level security policy for table baustellen"
-- beim Anlegen eines neuen Projekts, obwohl Rolle und Firma stimmten.
--
-- Ursache: die Lese-Policy von baustellen laeuft ueber kunde_hat_zugriff() ->
-- baustelle_im_eigenen_unternehmen(), die per Unterabfrage erneut gegen
-- public.baustellen selbst nachschlaegt. Das ist fuer jede ANDERE Tabelle
-- unproblematisch (dort wird eine bereits bestehende, andere Zeile in
-- baustellen nachgeschlagen) -- aber baustellen ist die einzige Tabelle, bei
-- der diese Unterabfrage exakt dieselbe, gerade erst eingefuegte Zeile in
-- derselben Tabelle sucht. Der Supabase-Client haengt nach jedem Insert ein
-- "select().single()" an (also INSERT ... RETURNING), und Postgres prueft
-- dafuer zusaetzlich zur INSERT-Policy auch die SELECT-Policy fuer die neue
-- Zeile -- deren Unterabfrage sieht die Zeile innerhalb desselben Kommandos
-- aber noch nicht. Live reproduziert: ohne RETURNING gelingt derselbe Insert
-- anstandslos, mit RETURNING schlaegt exakt dieselbe Zeile fehl.
--
-- Fix: baustellen bekommt eine eigene Lese-Policy, die die Unternehmens-
-- Zugehoerigkeit direkt aus der Spalte der einzufuegenden/zu lesenden Zeile
-- liest (unternehmen_id = current_unternehmen_id()) statt sie ueber eine
-- Unterabfrage zurueck in dieselbe Tabelle aufzuloesen. kunde_hat_zugriff()
-- bleibt fuer alle anderen Tabellen unveraendert (dort korrekt, siehe oben).

drop policy if exists "baustellen: zugriffsberechtigte lesen" on public.baustellen;
create policy "baustellen: zugriffsberechtigte lesen"
  on public.baustellen for select
  to authenticated
  using (
    unternehmen_id = public.current_unternehmen_id()
    and (
      public.current_role() is distinct from 'kunde'
      or exists (
        select 1 from public.baustelle_kunden bk
        where bk.baustelle_id = baustellen.id and bk.user_id = auth.uid()
      )
    )
  );
