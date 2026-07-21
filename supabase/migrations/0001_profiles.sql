-- supabase/migrations/0001_profiles.sql
-- FT-2: profiles table + auto-provisioning trigger on signup.
--
-- v1 note: RLS on `profiles` is intentionally wide open for SELECT
-- (any authenticated user can read any profile). This matches the
-- architecture doc's hardcoded two-user household for v1 — everyone
-- sees everyone. Revisit once groups (v2) introduce users outside the
-- household.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_color text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- With "Automatically expose new tables" disabled at the project level,
-- Postgres does not grant table-level privileges to `authenticated` by
-- default. RLS policies below are meaningless without these grants —
-- Postgres checks table grants before RLS is ever evaluated.
grant select, insert, update on public.profiles to authenticated;

-- Any authenticated user can read any profile (v1: everyone sees everyone).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- A user may only insert their own row. In practice this table is
-- populated by the handle_new_user() trigger below, which runs as the
-- table owner (security definer) and bypasses RLS entirely. This policy
-- exists as a safety net in case a client ever inserts directly.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- A user may only update their own row.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profiles row whenever a new auth.users row is created.
-- Prefers the `display_name` passed in signup metadata
-- (supabase.auth.signUp({ options: { data: { display_name } } })); falls
-- back to the local part of the user's email if none was provided.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
