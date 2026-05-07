-- Recipe 02 — RLS policies
--
-- TEACHING MOMENT: this recipe is a SHARED workspace. Recipe 01 scoped each
-- chat_sessions row to its owning user (`auth.uid() = user_id`). That pattern
-- is WRONG here — every reviewer must see every item, every chat message,
-- every gl_code. The right policy is "any authenticated user can read/write
-- the queue" with append-only enforcement on extraction_attempts.
--
-- Apply (idempotent):
--   psql "$DATABASE_URI" -f policies.sql

-- ─── Profiles ──────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ─── Items ─────────────────────────────────────────────────────────────────
alter table public.items enable row level security;

drop policy if exists items_read on public.items;
create policy items_read on public.items
  for select to authenticated using (true);

drop policy if exists items_update on public.items;
create policy items_update on public.items
  for update to authenticated
  using (true) with check (true);

drop policy if exists items_insert on public.items;
create policy items_insert on public.items
  for insert to authenticated with check (true);

-- ─── Extraction attempts (append-only) ─────────────────────────────────────
alter table public.extraction_attempts enable row level security;

drop policy if exists attempts_read on public.extraction_attempts;
create policy attempts_read on public.extraction_attempts
  for select to authenticated using (true);

drop policy if exists attempts_insert on public.extraction_attempts;
create policy attempts_insert on public.extraction_attempts
  for insert to authenticated with check (true);

-- No UPDATE / DELETE policies → append-only.

-- ─── GL codes ──────────────────────────────────────────────────────────────
alter table public.gl_codes enable row level security;

drop policy if exists gl_codes_read on public.gl_codes;
create policy gl_codes_read on public.gl_codes
  for select to authenticated using (true);

drop policy if exists gl_codes_insert on public.gl_codes;
create policy gl_codes_insert on public.gl_codes
  for insert to authenticated with check (true);

-- ─── Chat messages ─────────────────────────────────────────────────────────
alter table public.chat_messages enable row level security;

drop policy if exists chat_read on public.chat_messages;
create policy chat_read on public.chat_messages
  for select to authenticated using (true);

-- v1 caveat: client trusted to author agent messages honestly. See spec §
-- "v1 caveat: client-side authorship is trusted" for the production-grade
-- mediation pattern (deferred to a follow-on recipe).
drop policy if exists chat_insert on public.chat_messages;
create policy chat_insert on public.chat_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    or author_id in (select id from public.profiles where is_agent)
  );
