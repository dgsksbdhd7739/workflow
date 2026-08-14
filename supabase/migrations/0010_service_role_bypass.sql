-- Erlaubt der (server-seitigen, nie im Client sichtbaren) Service-Role
-- zusaetzlich zu Admins, die Rolle eines Profils zu setzen. Wird von der
-- "create-user"-Edge-Function benoetigt, die selbst vorher prueft, dass
-- die anfragende Person eingeloggter Admin ist, bevor sie den
-- Service-Role-Client fuer die eigentliche Erstellung nutzt.

create or replace function public.protect_role_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and public.current_role() is distinct from 'admin'
     and coalesce(auth.role(), '') is distinct from 'service_role'
  then
    new.role := old.role;
  end if;
  return new;
end;
$$;
