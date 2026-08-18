-- Fehlende UPDATE-Policy fuer push_tokens nachtragen: upsert() (INSERT ...
-- ON CONFLICT DO UPDATE) braucht neben der INSERT- auch eine UPDATE-Policy,
-- sonst schlaegt der Konfliktfall mit einer RLS-Verletzung fehl.

create policy "push_tokens: eigene aktualisieren"
  on public.push_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
