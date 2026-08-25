-- supabase/migrations/0010_push_tokens.sql
-- FT-15: push_tokens — device token storage for the shared push
-- notification primitive. select is granted even though nothing
-- client-side reads a token back deliberately: Postgres requires SELECT
-- privilege to satisfy the RETURNING clause upsert()/insert() use
-- internally to report what was written, regardless of whether the
-- caller asks for the row back. RLS still scopes it to the caller's own
-- row. The server-side send function (sendPush.ts) runs under the
-- service-role key, bypassing RLS entirely.

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
-- Postgres does not grant table-level privileges to any role by default —
-- including service_role. BYPASSRLS (which service_role has) only skips
-- row-level security policies, not the separate table-grant system, so
-- it still needs its own explicit grant here, same as authenticated.
grant select, insert, update, delete on public.push_tokens to authenticated;
grant select, insert, update, delete on public.push_tokens to service_role;

drop policy if exists "push_tokens_own_row" on public.push_tokens;
create policy "push_tokens_own_row"
  on public.push_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
