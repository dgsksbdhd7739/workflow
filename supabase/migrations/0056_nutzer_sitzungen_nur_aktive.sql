-- "Angemeldete Geraete" zeigte jede jemals benutzte Browser-Kennung (z. B.
-- 10x "Chrome auf Windows" durch verschiedene Domains/Browserprofile), weil
-- nutzer_sitzungen nie mit den echten Supabase-Sitzungen abgeglichen wurde.
-- Jetzt merkt sich jeder Eintrag die Auth-Sitzung (session_id aus dem JWT),
-- und angezeigt werden nur Eintraege, deren Sitzung in auth.sessions noch
-- existiert. Eintraege ohne (gueltige) Sitzung werden dabei aufgeraeumt.

alter table public.nutzer_sitzungen add column sitzung_id uuid;

create or replace function public.meine_aktiven_geraete()
returns setof public.nutzer_sitzungen
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.nutzer_sitzungen ns
  where ns.user_id = auth.uid()
    and not exists (
      select 1 from auth.sessions s
      where s.id = ns.sitzung_id
        and s.user_id = auth.uid()
        and (s.not_after is null or s.not_after > now())
    );

  return query
    select * from public.nutzer_sitzungen
    where user_id = auth.uid()
    order by letzter_zugriff desc;
end;
$$;

revoke all on function public.meine_aktiven_geraete() from public;
grant execute on function public.meine_aktiven_geraete() to authenticated;
