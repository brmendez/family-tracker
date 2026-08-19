-- supabase/migrations/0006_invite_responses.sql
-- FT-10: accept/decline for an existing account's pending invites. No new
-- tables/columns/grants/policies — invites.status already includes
-- 'declined' and responded_at is already present, both reserved by FT-9
-- for exactly this ticket. RPC-mediated reads too (not a raw SELECT
-- grant) — see ARCHITECTURE.md's FT-10 detail for why a grant + policy
-- on invites/groups was deliberately rejected in favor of one
-- SECURITY DEFINER read that can join to groups.name in a single hop.

-- Lists the caller's own pending invites, resolving their email the same
-- way match_pending_invites_for_new_profile does (auth.users by
-- auth.uid(), not auth.jwt()). Omits invited_by/inviter name on purpose —
-- not required by this ticket, see ARCHITECTURE.md.
create or replace function public.list_my_pending_invites()
returns table (
  invite_id uuid,
  group_id uuid,
  group_name text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_email text;
begin
  select lower(btrim(email)) into v_email
  from auth.users
  where id = auth.uid();

  if v_email is null then
    return;
  end if;

  return query
  select i.id, i.group_id, g.name, i.created_at
  from public.invites i
  join public.groups g on g.id = i.group_id
  where i.invited_email = v_email
    and i.status = 'pending';
end;
$$;

-- Accepts one of the caller's own pending invites. Re-checks the invite
-- row itself (existence, status, ownership) rather than trusting the id
-- it's handed, then delegates the actual membership grant to FT-9's
-- grant_group_membership_from_invite — unchanged, untouched.
create or replace function public.accept_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite public.invites;
begin
  select lower(btrim(email)) into v_email
  from auth.users
  where id = auth.uid();

  select * into v_invite
  from public.invites
  where id = p_invite_id;

  if v_invite.id is null then
    raise exception 'This invite is no longer available.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invite has already been responded to.';
  end if;

  if v_invite.invited_email is distinct from v_email then
    raise exception 'This invite is no longer available.';
  end if;

  perform public.grant_group_membership_from_invite(p_invite_id, auth.uid());
end;
$$;

-- Declines one of the caller's own pending invites. Must be an RPC, not a
-- raw UPDATE grant — a client-writable status column guarded only by
-- row ownership would let a client set status = 'accepted' directly,
-- skipping grant_group_membership_from_invite and leaving an accepted
-- invite with no matching group_members row.
create or replace function public.decline_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite public.invites;
begin
  select lower(btrim(email)) into v_email
  from auth.users
  where id = auth.uid();

  select * into v_invite
  from public.invites
  where id = p_invite_id;

  if v_invite.id is null then
    raise exception 'This invite is no longer available.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invite has already been responded to.';
  end if;

  if v_invite.invited_email is distinct from v_email then
    raise exception 'This invite is no longer available.';
  end if;

  update public.invites
  set status = 'declined',
      responded_at = now()
  where id = p_invite_id;
end;
$$;
