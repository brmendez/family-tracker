-- supabase/migrations/0014_group_visibility_overrides.sql
-- FT-19: group_visibility_overrides — append-only hide/unhide log per
-- decisions #6/#7 (see ARCHITECTURE.md's "locked schema consequence").
-- Schema/RLS only, same precedent as FT-13: FT-20 is the first writer,
-- via an RPC not yet added here.

create table if not exists public.group_visibility_overrides (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('hide', 'unhide')),
  -- Only meaningful for 'hide'; null = indefinite. Passage of time alone
  -- flips a duration-limited hide back to visible, no matching 'unhide'
  -- row required — see ARCHITECTURE.md's event-sourced derivation note.
  expires_at timestamptz null check (event_type = 'hide' or expires_at is null),
  created_at timestamptz not null default now()
  -- Deliberately no FK to group_members: a departed member's override
  -- history must stay answerable for "was hidden at time T" (decision #7).
);

-- Supports the "latest row for (group_id, user_id)" lookup both
-- is_hidden_from_group and FT-20's own-state fetch need.
create index if not exists group_visibility_overrides_group_user_created_idx
  on public.group_visibility_overrides (group_id, user_id, created_at desc);

alter table public.group_visibility_overrides enable row level security;

-- With "Automatically expose new tables" disabled at the project level,
-- Postgres does not grant table-level privileges to `authenticated` by
-- default. RLS policies below are meaningless without this grant.
--
-- select only — no insert/update/delete grant. Write access is RPC-only
-- (FT-20's set_group_visibility), one consistent write path for every
-- duration instead of a plain-grant/RPC split. Confirmed with Brian
-- 2026-09-02.
grant select on public.group_visibility_overrides to authenticated;

-- A user reads their own hide history/current state only; no policy lets
-- one member browse another's. Enforcement of who's hidden from whom
-- happens via location_history's policy below, not by exposing this table.
drop policy if exists "group_visibility_overrides_select_own" on public.group_visibility_overrides;
create policy "group_visibility_overrides_select_own"
  on public.group_visibility_overrides
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Same hardening pattern as FT-7/FT-12's helpers: SECURITY DEFINER +
-- pinned search_path, needed because this reads rows the caller doesn't
-- own, deliberately bypassing the self-only policy above.
--
-- "Is user U currently hidden from group G": take the single latest row
-- for (G, U) ordered by created_at desc; true iff event_type = 'hide'
-- and (expires_at is null or expires_at > now()). No row ever existing
-- returns false, matching today's FT-12 behavior for every user until
-- FT-20 ships.
create or replace function public.is_hidden_from_group(p_user_id uuid, p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select event_type = 'hide' and (expires_at is null or expires_at > now())
      from public.group_visibility_overrides
      where user_id = p_user_id
        and group_id = p_group_id
      order by created_at desc
      limit 1
    ),
    false
  );
$$;

-- Replaces FT-12's shares_group_with at the location_history call site:
-- true iff there exists a group both auth.uid() and p_user_id belong to
-- where p_user_id is not hidden from that group. shares_group_with
-- itself is left in place, unused after this migration but not dropped
-- — removing a function used by one now-replaced policy isn't worth the
-- risk for a ticket that isn't about cleanup.
create or replace function public.shares_visible_group_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members caller_membership
    join public.group_members target_membership
      on target_membership.group_id = caller_membership.group_id
    where caller_membership.user_id = auth.uid()
      and target_membership.user_id = p_user_id
      and not public.is_hidden_from_group(p_user_id, caller_membership.group_id)
  );
$$;

-- Per decision #11, gates on any shared *visible* group, not the
-- caller's active one. Self-clause unchanged and still load-bearing —
-- hiding blocks other members' view, never your own.
drop policy if exists "location_history_select_shared_group_member" on public.location_history;
drop policy if exists "location_history_select_shared_visible_group_member" on public.location_history;
create policy "location_history_select_shared_visible_group_member"
  on public.location_history
  for select
  to authenticated
  using (auth.uid() = user_id or public.shares_visible_group_with(user_id));
