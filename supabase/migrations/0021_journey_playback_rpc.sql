-- supabase/migrations/0021_journey_playback_rpc.sql
-- FT-23: get_journey_playback_points — a member's location_history for one
-- calendar day, with rows redacted per their *own* recorded_at against
-- FT-19/21's event-sourced hide history, not the member's current hidden
-- state. location_history's own RLS (FT-19/21) can't express "hidden at
-- time T" (it gates on now()), so this bypasses it entirely via
-- SECURITY DEFINER and does its own authorization check instead.

-- Same derivation as is_hidden_from_group (0014), parameterized by p_at
-- instead of now(): latest row for (group_id, user_id) with
-- created_at <= p_at, so a row written after p_at can't retroactively
-- redact an earlier instant.
create or replace function public.is_hidden_from_group_at(
  p_user_id uuid,
  p_group_id uuid,
  p_at timestamptz
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select event_type = 'hide' and (expires_at is null or expires_at > p_at)
      from public.group_visibility_overrides
      where user_id = p_user_id
        and group_id = p_group_id
        and created_at <= p_at
      order by created_at desc
      limit 1
    ),
    false
  );
$$;

-- Same pattern as is_globally_hidden (0018), parameterized by p_at.
create or replace function public.is_globally_hidden_at(
  p_user_id uuid,
  p_at timestamptz
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select event_type = 'hide' and (expires_at is null or expires_at > p_at)
      from public.global_visibility_overrides
      where user_id = p_user_id
        and created_at <= p_at
      order by created_at desc
      limit 1
    ),
    false
  );
$$;

-- p_user_id = auth.uid() (self) skips authorization/redaction entirely —
-- self always sees full own history, same self-clause precedent as every
-- other visibility policy in this project. Otherwise both the caller and
-- the viewed member must currently belong to p_group_id (defense in
-- depth — FT-22's roster only ever offers current members, but this is
-- the actual authorization boundary now, replacing reliance on live
-- location_history RLS).
--
-- Redacted rows have latitude/longitude/speed_mps/heading_deg nulled
-- server-side — the coordinates themselves never leave the DB for a
-- redacted instant, same posture as RLS never sending a hidden row at
-- all today.
create or replace function public.get_journey_playback_points(
  p_user_id uuid,
  p_group_id uuid,
  p_date_local date,
  p_timezone text
)
returns table (
  id uuid,
  recorded_at timestamptz,
  latitude float8,
  longitude float8,
  speed_mps float8,
  heading_deg float8,
  is_redacted boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_self boolean;
  v_start_at timestamptz;
  v_end_at timestamptz;
begin
  v_self := p_user_id = auth.uid();

  if not v_self then
    if not public.is_group_member(p_group_id) then
      raise exception 'Only group members can view this group''s history.';
    end if;

    if not exists (
      select 1
      from public.group_members
      where group_id = p_group_id
        and user_id = p_user_id
    ) then
      raise exception 'That member is no longer in this group.';
    end if;
  end if;

  -- Local-midnight day boundary, same round-trip convention as
  -- set_group_visibility's (0015) "all day" expiry: naive wall-clock
  -- timestamp interpreted in p_timezone, converted to timestamptz.
  v_start_at := p_date_local::timestamp at time zone p_timezone;
  v_end_at := v_start_at + interval '1 day';

  return query
    select
      r.id,
      r.recorded_at,
      case when r.is_redacted then null else r.latitude end,
      case when r.is_redacted then null else r.longitude end,
      case when r.is_redacted then null else r.speed_mps end,
      case when r.is_redacted then null else r.heading_deg end,
      r.is_redacted
    from (
      select
        lh.id,
        lh.recorded_at,
        lh.latitude,
        lh.longitude,
        lh.speed_mps,
        lh.heading_deg,
        (not v_self)
          and (
            public.is_globally_hidden_at(p_user_id, lh.recorded_at)
            or public.is_hidden_from_group_at(p_user_id, p_group_id, lh.recorded_at)
          ) as is_redacted
      from public.location_history lh
      where lh.user_id = p_user_id
        and lh.recorded_at >= v_start_at
        and lh.recorded_at < v_end_at
    ) r
    order by r.recorded_at asc;
end;
$$;

-- No explicit grant execute statement: same default-PUBLIC-EXECUTE
-- precedent as every other RPC in this codebase.
