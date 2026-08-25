-- supabase/migrations/0010_push_tokens.sql
-- FT-15: push_tokens — device token storage for the shared push
-- notification primitive. No select grant: nothing client-side reads a
-- user's own tokens back, and the server-side send function (sendPush.ts)
-- runs under the service-role key, bypassing RLS entirely.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Unique on the token itself, not (user_id, token): a token belongs to
  -- one device installation, and the same physical device can later sign
  -- into a different account (shared household device). Upsert-on-
  -- conflict-by-token reassigns user_id instead of accumulating stale
  -- rows for the old account.
  expo_push_token text not null unique,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- With "Automatically expose new tables" disabled at the project level,
-- Postgres does not grant table-level privileges to `authenticated` by
-- default. RLS policies below are meaningless without these grants.
grant insert, update, delete on public.push_tokens to authenticated;

drop policy if exists "push_tokens_own_row" on public.push_tokens;
create policy "push_tokens_own_row"
  on public.push_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
