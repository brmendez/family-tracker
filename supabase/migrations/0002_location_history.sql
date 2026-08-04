-- supabase/migrations/0002_location_history.sql
-- FT-5: location_history table — the user's own GPS fixes, written on
-- every useForegroundLocation update.
--
-- This table is append-only BY DESIGN, not an oversight: v5 (journey
-- playback, FT-22/23) and v6 (speed/activity detection, FT-25-27) both
-- depend on a full immutable history of fixes, not a "latest location"
-- row that gets overwritten. There is deliberately no UPDATE or DELETE
-- policy, and no update/delete grant to `authenticated` below — insert
-- and select only. See ARCHITECTURE.md's "locked schema consequence"
-- note for the same pattern applied to visibility overrides (v4).
--
-- v1 note: RLS SELECT is intentionally wide open (any authenticated user
-- can read any row), matching profiles' current v1 policy — hardcoded
-- two-user household, everyone sees everyone. This narrows in FT-12
-- (group-scoped visibility) — not this ticket's concern.

create table if not exists public.location_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  latitude float8 not null,
  longitude float8 not null,
  recorded_at timestamptz not null,
  accuracy float8,
  speed_mps float8,
  heading_deg float8,
  created_at timestamptz not null default now()
);

-- Needed for both "latest location per user" lookups (FT-6) and future
-- range queries (v5 playback).
create index if not exists location_history_user_recorded_at_idx
  on public.location_history (user_id, recorded_at desc);

alter table public.location_history enable row level security;

-- With "Automatically expose new tables" disabled at the project level,
-- Postgres does not grant table-level privileges to `authenticated` by
-- default. RLS policies below are meaningless without these grants —
-- Postgres checks table grants before RLS is ever evaluated. Note there
-- is deliberately no update/delete grant here — see append-only note above.
grant select, insert on public.location_history to authenticated;

-- Any authenticated user can read any row (v1: everyone sees everyone).
drop policy if exists "location_history_select_authenticated" on public.location_history;
create policy "location_history_select_authenticated"
  on public.location_history
  for select
  to authenticated
  using (true);

-- A user may only insert rows for themselves.
drop policy if exists "location_history_insert_own" on public.location_history;
create policy "location_history_insert_own"
  on public.location_history
  for insert
  to authenticated
  with check (auth.uid() = user_id);
