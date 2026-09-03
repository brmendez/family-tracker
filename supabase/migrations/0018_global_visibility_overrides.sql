-- supabase/migrations/0018_global_visibility_overrides.sql
-- FT-21: global_visibility_overrides — same event-sourced hide/unhide log
-- shape as FT-19's group_visibility_overrides (0014), but group-agnostic.
-- Landed alongside the RLS gate it adds to location_history so "globally
-- hidden" takes effect at the DB layer as soon as a row exists, before
-- FT-21's own RPC (0019) ships any write path.

create table if not exists public.global_visibility_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('hide', 'unhide')),
  -- Only meaningful for 'hide'; null = indefinite. Same derivation as
  -- group_visibility_overrides — passage of time alone flips a
  -- duration-limited hide back to visible, no matching 'unhide' row needed.
  expires_at timestamptz null check (event_type = 'hide' or expires_at is null),
  created_at timestamptz not null default now()
  -- No FK to any group — intentionally group-agnostic (decision #6).
);

-- Supports the "latest row for user_id" lookup both is_globally_hidden and
-- FT-21's own-state fetch need.
create index if not exists global_visibility_overrides_user_created_idx
  on public.global_visibility_overrides (user_id, created_at desc);

alter table public.global_visibility_overrides enable row level security;

-- Same posture as FT-19: RPC-only write path (0019's set_global_visibility),
-- select only granted directly.
grant select on public.global_visibility_overrides to authenticated;

drop policy if exists "global_visibility_overrides_select_own" on public.global_visibility_overrides;
create policy "global_visibility_overrides_select_own"
  on public.global_visibility_overrides
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Same hardening pattern as is_hidden_from_group: SECURITY DEFINER +
-- pinned search_path, needed because this reads rows the caller doesn't
-- own, deliberately bypassing the self-only policy above.
create or replace function public.is_globally_hidden(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select event_type = 'hide' and (expires_at is null or expires_at > now())
      from public.global_visibility_overrides
      where user_id = p_user_id
      order by created_at desc
      limit 1
    ),
    false
  );
$$;

-- FT-19's location_history policy gated purely on shares_visible_group_with;
-- this adds one outer "checked before per-group logic" clause (decision #6)
-- rather than layering the global check inside shares_visible_group_with
-- itself, so it applies uniformly with no per-group-policy duplication.
-- Self-clause unchanged and still load-bearing — a globally hidden user
-- still always sees their own location.
drop policy if exists "location_history_select_shared_visible_group_member" on public.location_history;
drop policy if exists "location_history_select_shared_visible_group_member_ungated" on public.location_history;
create policy "location_history_select_shared_visible_group_member_ungated"
  on public.location_history
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or (not public.is_globally_hidden(user_id) and public.shares_visible_group_with(user_id))
  );
