-- supabase/migrations/0004_groups.sql
-- FT-7: groups + group_members — the foundational tables every v2+
-- group-scoped feature (invites, geofences, visibility overrides,
-- location RLS) builds on.
--
-- This is schema only: no screens, hooks, or context land in this
-- migration. See ARCHITECTURE.md / the FT-7 ticket for the full design
-- rationale (owner-vs-member role model, decision #1/#2).

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  -- Provenance only, not the source of truth for current ownership (that
  -- lives in group_members.role below) — kept separate so a future
  -- "ownership transfer" feature never has to touch this column.
  -- `on delete set null` (not cascade) so a group and its history survive
  -- its creator's account being deleted later, as long as other members
  -- remain.
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  -- Composite PK: this is a join table, so (group_id, user_id) both
  -- models membership and prevents duplicate rows without a surrogate key.
  primary key (group_id, user_id)
);

-- Enforces "exactly one owner per group" at the database level, not just
-- in application code. A `role` column + a check constraint (valid
-- values, above) + this partial unique index (cardinality invariant) is
-- the full answer to "how is role enforced" — RLS policies below just
-- read the column.
create unique index if not exists group_members_one_owner_per_group_idx
  on public.group_members (group_id)
  where role = 'owner';

-- The composite PK's leading column is group_id, so reverse lookups
-- ("which groups is this user in") need their own index — this is
-- exactly the shape FT-12's location_history RLS rewrite and the future
-- GroupsProvider group list will query on every load.
create index if not exists group_members_user_id_idx
  on public.group_members (user_id);

-- Cascade behavior is intentional and doubles as account-deletion
-- handling: profiles.id -> auth.users.id already cascades (FT-2). So
-- deleting an auth.users row -> cascades to profiles -> cascades to
-- group_members -> fires the auto-delete trigger below exactly as if
-- that user had explicitly left. No special-cased "account deleted"
-- logic is needed anywhere in v2.

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- With "Automatically expose new tables" disabled at the project level,
-- Postgres does not grant table-level privileges to `authenticated` by
-- default. RLS policies below are meaningless without these grants —
-- Postgres checks table grants before RLS is ever evaluated.
--
-- No INSERT grant on `groups`. Creating a group is a two-table operation
-- — a `groups` row is meaningless (and permanently unreadable, since
-- SELECT requires membership) unless a `group_members` owner row is
-- created in the same transaction. Allowing a bare client INSERT risks
-- orphaned, invisible rows. Instead, creation goes through the
-- `create_group` RPC below, which does both inserts atomically as
-- SECURITY DEFINER, bypassing grants/RLS entirely for that one
-- guaranteed-consistent path.
grant select, delete on public.groups to authenticated;
-- Column-level grant — locks down what a client can ever change on this
-- row, even under a permissive policy.
grant update (name) on public.groups to authenticated;

-- No INSERT or UPDATE grant on `group_members`. The only sanctioned
-- insert path today is the create_group RPC's internal owner-row insert
-- (definer, bypasses grants). The invite mechanism (decision #3, still
-- open) will add whatever insert path it needs in FT-9/FT-10 — not
-- pre-guessed here. No UPDATE grant means no role-change/promotion
-- mechanism exists yet either; that's a separate, unticketed decision.
grant select, delete on public.group_members to authenticated;

-- Helper functions — the standard vocabulary for group-scoped RLS across
-- the rest of the roadmap (FT-12 location_history rewrite, FT-13
-- geofences, FT-19 visibility overrides all reuse these; they should not
-- reinvent per-table membership checks). SECURITY DEFINER + pinned
-- search_path (same hardening pattern as handle_new_user() in
-- 0001_profiles.sql) so they read group_members bypassing RLS
-- internally — this is what avoids the recursive-RLS problem of a
-- group_members SELECT policy querying group_members under RLS again.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
  on public.groups
  for select
  to authenticated
  using (public.is_group_member(id));

drop policy if exists "groups_update_owner" on public.groups;
create policy "groups_update_owner"
  on public.groups
  for update
  to authenticated
  using (public.is_group_owner(id))
  with check (public.is_group_owner(id));

drop policy if exists "groups_delete_owner" on public.groups;
create policy "groups_delete_owner"
  on public.groups
  for delete
  to authenticated
  using (public.is_group_owner(id));

drop policy if exists "group_members_select_fellow_member" on public.group_members;
create policy "group_members_select_fellow_member"
  on public.group_members
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- Covers both cases in one clause: a member deleting their own row =
-- leave; an owner deleting someone else's row = remove-member. No
-- separate RPC needed for either.
drop policy if exists "group_members_delete_self_or_owner" on public.group_members;
create policy "group_members_delete_self_or_owner"
  on public.group_members
  for delete
  to authenticated
  using (user_id = auth.uid() or public.is_group_owner(group_id));

-- Auto-delete a group once its last member leaves/is removed.
--
-- Must be SECURITY DEFINER: the member performing the last leave may not
-- satisfy groups_delete_owner's RLS (e.g. the ownerless-group edge case,
-- or a non-owner's own last-row delete). The trigger needs elevated
-- privilege specifically to guarantee cleanup regardless of who
-- triggered it.
--
-- Safe under batch deletes: AFTER ROW triggers on a multi-row DELETE
-- fire once per row, after the full statement's row removals are
-- already applied — so by the time any single invocation runs its
-- count(*), the batch's other deletions are already visible. Multiple
-- invocations for the same group_id in one statement are harmless: the
-- first deletes the group, subsequent ones match zero rows and no-op.
--
-- Safe under FK cascade recursion: if an owner explicitly deletes a
-- groups row directly (satisfies groups_delete_owner), the group_id
-- FK's `on delete cascade` removes all group_members rows for it, which
-- re-fires this same trigger for each cascaded row. Its
-- `delete from groups where id = OLD.group_id` simply matches zero rows
-- (already gone) — no error, no infinite loop. Documented here so a
-- future reader doesn't "fix" this as a bug.
create or replace function public.delete_group_if_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_members int;
begin
  select count(*) into remaining_members
  from public.group_members
  where group_id = old.group_id;

  if remaining_members = 0 then
    delete from public.groups where id = old.group_id;
  end if;

  return old;
end;
$$;

drop trigger if exists group_members_delete_if_empty on public.group_members;

create trigger group_members_delete_if_empty
  after delete on public.group_members
  for each row
  execute function public.delete_group_if_empty();

-- The only sanctioned group-creation path. Both inserts happen in the
-- same statement/transaction (a plpgsql function body is implicitly one
-- transaction), so there is no window where a `groups` row exists
-- without its owner membership row. FT-8 calls this via
-- supabase.rpc('create_group', { p_name: ... }), never a raw
-- `.from('groups').insert(...)`. SECURITY DEFINER bypasses the missing
-- INSERT grants/policies on both tables for this one guaranteed-
-- consistent path.
create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group public.groups;
begin
  insert into public.groups (name, created_by)
  values (p_name, auth.uid())
  returning * into new_group;

  insert into public.group_members (group_id, user_id, role)
  values (new_group.id, auth.uid(), 'owner');

  return new_group;
end;
$$;
