-- Recipe 01 — Schema
--
-- Creates the chat_sessions table, one row per conversation scoped to an
-- end-user. `agent_session_id` maps to the Powabase AI session id returned by
-- POST /api/orchestrations/:id/runs.
--
-- Apply (idempotent):
--   psql "$DATABASE_URI" -f schema.sql

create table if not exists public.chat_sessions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  agent_session_id      text not null,
  title                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists chat_sessions_user_idx
  on public.chat_sessions(user_id, created_at desc);

-- Auto-update updated_at on row change
create or replace function public.touch_chat_sessions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chat_sessions_touch_updated_at on public.chat_sessions;
create trigger chat_sessions_touch_updated_at
  before update on public.chat_sessions
  for each row execute procedure public.touch_chat_sessions_updated_at();
