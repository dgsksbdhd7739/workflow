-- Plattform-Admin wechselt auf einen neuen, separaten Account (Firma RGS,
-- Rolle admin; per Admin-API angelegt). Der bisherige Account bleibt als
-- normaler Firmen-Admin von RGS bestehen, verliert aber die Plattformrechte.
-- Bewusst ueber Account-IDs statt E-Mail-Adressen, da das Repo oeffentlich ist.

insert into public.plattform_admins (user_id)
select id from public.profiles where id = 'bb08c106-814d-47d1-adb0-47633d7151fc'
on conflict do nothing;

-- nur entfernen, wenn der neue Eintrag wirklich existiert (nie ohne Plattform-Admin)
delete from public.plattform_admins
where user_id = '67288114-3a20-49db-9fcd-c3bae537a96f'
  and exists (select 1 from public.plattform_admins where user_id = 'bb08c106-814d-47d1-adb0-47633d7151fc');
