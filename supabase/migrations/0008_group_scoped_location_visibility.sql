-- supabase/migrations/0008_group_scoped_location_visibility.sql
-- FT-12: narrows location_history's SELECT policy from "any authenticated
-- user" (v1 hardcode, 0002_location_history.sql) to "shares a group with
-- the row's owner." Does not touch 0002's INSERT policy or grants.

-- Same hardening pattern as FT-7's is_group_member/is_group_owner
-- (0004_groups.sql): SECURITY DEFINER + pinned search_path, reads
-- group_members bypassing RLS internally. Unlike is_group_member (checks
-- membership in one named group), this checks "is there any group both
-- auth.uid() and p_user_id belong to" — needed for location_history's
-- per-row visibility check, which has no group_id column of its own.
create or replace function public.shares_group_with(p_user_id uuid)
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
  );
$$;

-- Per decision #11: gates on any shared group, not the caller's active
-- one — the map's per-group switcher is a display filter, not an
-- authorization boundary.
drop policy if exists "location_history_select_authenticated" on public.location_history;
drop policy if exists "location_history_select_shared_group_member" on public.location_history;
create policy "location_history_select_shared_group_member"
  on public.location_history
  for select
  to authenticated
  using (auth.uid() = user_id or public.shares_group_with(user_id));
