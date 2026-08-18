-- supabase/migrations/0005_invites.sql
-- FT-9: invites table + email-match-at-signup membership grant, per
-- locked decision #3. `token` is reserved-but-unused so a future
-- deferred-deep-link path is additive, not a rework — see
-- ARCHITECTURE.md's FT-9 detail for the full design rationale.

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- Normalized (trim + lowercase) in send_invite before insert; this
  -- check is a backstop, not the normalization step itself.
  invited_email text not null check (invited_email = lower(btrim(invited_email))),
  -- Provenance only, not a permission source — any member can invite (#1).
  invited_by uuid references public.profiles (id) on delete set null,
  -- Reserved for a future deferred-deep-link path (#3). `text`, not
  -- `uuid`: the eventual provider's token format isn't known yet.
  token text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

-- Backstops send_invite's own idempotent-insert handling (edge case #2):
-- old accepted/declined rows for the same pair don't block a fresh invite.
create unique index if not exists invites_group_email_pending_idx
  on public.invites (group_id, invited_email)
  where status = 'pending';

-- Free today, avoids a later migration once the token path is built.
create unique index if not exists invites_token_idx
  on public.invites (token)
  where token is not null;

-- Supports the signup-time lookup in match_pending_invites_for_new_profile.
create index if not exists invites_invited_email_idx
  on public.invites (invited_email);

alter table public.invites enable row level security;

-- No grants to `authenticated` at all — unlike groups/group_members,
-- there is no safe partial-client-access story here (any member can see
-- who they invited, but nothing needs SELECT yet, and INSERT would let a
-- client bypass the already-a-member/idempotency checks below). All
-- access goes through the SECURITY DEFINER functions below. No policies
-- written now — FT-10 adds them alongside whatever grant it needs.

-- The only sanctioned invite-creation path. Checks membership, normalizes
-- the email, rejects an already-a-member invite, and relies on
-- invites_group_email_pending_idx (via ON CONFLICT) rather than a
-- separate pre-check to treat a duplicate pending invite as a no-op —
-- avoids a check-then-insert race under concurrent calls.
create or replace function public.send_invite(p_group_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_existing_user_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can send invites.';
  end if;

  v_email := lower(btrim(p_email));

  if v_email = '' then
    raise exception 'An email address is required.';
  end if;

  select id into v_existing_user_id
  from auth.users
  where lower(email) = v_email;

  if v_existing_user_id is not null and exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = v_existing_user_id
  ) then
    raise exception 'That person is already a member of this group.';
  end if;

  insert into public.invites (group_id, invited_email, invited_by)
  values (p_group_id, v_email, auth.uid())
  on conflict (group_id, invited_email) where status = 'pending' do nothing;
end;
$$;

-- Reusable membership-grant primitive (decision #3) — the signup trigger
-- below calls this, and FT-10's future accept_invite RPC (and any later
-- token-resolution path) should call it too rather than reimplementing
-- the grant. Internal only: EXECUTE is revoked from public/authenticated
-- below, since this bypasses send_invite's checks entirely on purpose.
create or replace function public.grant_group_membership_from_invite(
  p_invite_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select group_id into v_group_id
  from public.invites
  where id = p_invite_id;

  if v_group_id is null then
    return;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group_id, p_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  update public.invites
  set status = 'accepted',
      responded_at = now()
  where id = p_invite_id;
end;
$$;

revoke execute on function public.grant_group_membership_from_invite(uuid, uuid) from public;

-- Auto-match trigger — on public.profiles, not auth.users, and not
-- folded into handle_new_user() (0001_profiles.sql). By the time a
-- profiles row exists, the FK grant_group_membership_from_invite needs is
-- guaranteed present, and this avoids both touching FT-2's tested trigger
-- and same-table multi-trigger firing-order fragility.
create or replace function public.match_pending_invites_for_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite record;
begin
  select lower(btrim(email)) into v_email
  from auth.users
  where id = new.id;

  if v_email is null then
    return new;
  end if;

  for v_invite in
    select id
    from public.invites
    where invited_email = v_email
      and status = 'pending'
  loop
    perform public.grant_group_membership_from_invite(v_invite.id, new.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_match_pending_invites on public.profiles;

create trigger profiles_match_pending_invites
  after insert on public.profiles
  for each row
  execute function public.match_pending_invites_for_new_profile();
