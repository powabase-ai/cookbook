-- Recipe 02 — Schema
--
-- Creates the public-schema tables that back the HITL invoice extraction queue:
-- profiles (with display_name + is_agent), items (the queue), extraction_attempts
-- (append-only history), gl_codes (downstream output), chat_messages (per-item thread).
--
-- The arithmetic-validation BEFORE UPDATE trigger on items keeps `_arithmetic_valid`
-- accurate on every patch (including agent re-extractions and inline reviewer edits).
--
-- Apply (idempotent):
--   psql "$DATABASE_URI" -f schema.sql

-- ─── Profiles ──────────────────────────────────────────────────────────────
-- profiles.id is the auth.users id. is_agent=true rows are seeded by seed-agents.ts
-- against agent-backing auth.users rows created via the GoTrue admin API.
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null,
  is_agent        boolean not null default false,
  created_at      timestamptz not null default now()
);

-- Auto-create profile on auth.users insert. For human signups, display_name
-- defaults to email local-part. seed-agents.ts overrides display_name explicitly
-- after creating each agent's auth.users row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Items (the queue) ─────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'item_status') then
    create type item_status as enum ('escalated', 'approved', 'rejected', 'extraction_failed');
  end if;
end $$;

create table if not exists public.items (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid not null,
  status              item_status not null default 'escalated',
  draft_extraction    jsonb,
  extraction_error    text,
  decided_by          uuid references public.profiles(id),
  decided_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint items_extraction_invariant check (
    (status = 'extraction_failed' and draft_extraction is null and extraction_error is not null) or
    (status <> 'extraction_failed' and draft_extraction is not null and extraction_error is null)
  )
);

create index if not exists items_status_idx on public.items(status, created_at desc);
create index if not exists items_source_idx on public.items(source_id);

-- Touch updated_at on UPDATE
create or replace function public.touch_items_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute procedure public.touch_items_updated_at();

-- Recompute _arithmetic_valid on every UPDATE that touches draft_extraction.
-- The validation: sum(line_items[].amount) + tax.value ≈ total.value within $0.02.
-- Server-side because the client cannot be trusted to recompute on every patch path.
create or replace function public.recompute_arithmetic_valid()
returns trigger language plpgsql as $$
declare
  v_sum numeric := 0;
  v_tax numeric;
  v_total numeric;
  v_line jsonb;
  v_valid boolean;
begin
  if new.draft_extraction is null then
    return new;
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(new.draft_extraction->'line_items', '[]'::jsonb))
  loop
    v_sum := v_sum + coalesce((v_line->>'amount')::numeric, 0);
  end loop;

  v_tax := coalesce((new.draft_extraction->'tax'->>'value')::numeric, 0);
  v_total := coalesce((new.draft_extraction->'total'->>'value')::numeric, 0);

  v_valid := abs((v_sum + v_tax) - v_total) <= 0.02;

  new.draft_extraction := jsonb_set(
    new.draft_extraction,
    '{_arithmetic_valid}',
    to_jsonb(v_valid),
    true
  );
  return new;
end;
$$;

drop trigger if exists items_recompute_arithmetic on public.items;
create trigger items_recompute_arithmetic
  before insert or update of draft_extraction on public.items
  for each row execute procedure public.recompute_arithmetic_valid();

-- ─── Extraction attempts (append-only history) ─────────────────────────────
create table if not exists public.extraction_attempts (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.items(id) on delete cascade,
  attempt_number  int not null,
  target_field    text,
  hint            text,
  extraction      jsonb not null,
  attempted_by    uuid not null references public.profiles(id),
  created_at      timestamptz not null default now()
);

create unique index if not exists extraction_attempts_item_attempt_idx
  on public.extraction_attempts(item_id, attempt_number);

-- Auto-assign monotonic attempt_number per item.
--
-- v1 caveat: this is a read-then-write trigger with no advisory lock, so two
-- concurrent INSERTs on the same item_id can both compute max+1 = N and the
-- second one fails on the unique (item_id, attempt_number) constraint with
-- a confusing duplicate-key error. v1 ships as-is — re-extractions are user-
-- driven and serial in practice. A production version would use
-- `pg_advisory_xact_lock(hashtext(item_id::text))` here, or refactor to a
-- per-item counter row.
create or replace function public.assign_attempt_number()
returns trigger language plpgsql as $$
begin
  if new.attempt_number is null or new.attempt_number = 0 then
    select coalesce(max(attempt_number), 0) + 1
      into new.attempt_number
      from public.extraction_attempts
      where item_id = new.item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists extraction_attempts_assign_number on public.extraction_attempts;
create trigger extraction_attempts_assign_number
  before insert on public.extraction_attempts
  for each row execute procedure public.assign_attempt_number();

-- ─── GL codes (downstream output) ──────────────────────────────────────────
create table if not exists public.gl_codes (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references public.items(id) on delete cascade,
  line_item_index   int not null,
  gl_code           text not null,
  rationale         text,
  needs_cfo_review  boolean not null default false,
  confidence        numeric(3, 2),
  created_at        timestamptz not null default now(),
  unique (item_id, line_item_index)
);

-- ─── Chat messages (per-item thread) ───────────────────────────────────────
create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.items(id) on delete cascade,
  author_id       uuid not null references public.profiles(id),
  content         text not null,
  attempt_id      uuid references public.extraction_attempts(id),
  created_at      timestamptz not null default now()
);

create index if not exists chat_messages_item_idx on public.chat_messages(item_id, created_at);

-- Enable Realtime publication for the tables the app subscribes to.
-- Postgres Changes won't fire without these tables being on the
-- supabase_realtime publication. Wrapped in DO blocks because
-- `alter publication ... add table` is NOT idempotent — re-running schema.sql
-- without the guard fails with "relation X is already member of publication."
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='items'
  ) then alter publication supabase_realtime add table public.items;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='extraction_attempts'
  ) then alter publication supabase_realtime add table public.extraction_attempts;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='gl_codes'
  ) then alter publication supabase_realtime add table public.gl_codes;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages'
  ) then alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
