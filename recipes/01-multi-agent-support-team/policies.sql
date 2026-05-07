-- Recipe 01 — RLS
--
-- A user can read, insert, update, and delete only their own chat_sessions rows.
--
-- Apply (idempotent):
--   psql "$DATABASE_URI" -f policies.sql

alter table public.chat_sessions enable row level security;

drop policy if exists chat_sessions_self_all on public.chat_sessions;

create policy chat_sessions_self_all on public.chat_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
