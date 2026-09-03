-- supabase/migrations/0015_set_group_visibility_rpc.sql
-- FT-20: set_group_visibility — the single write path for every hide
-- duration into group_visibility_overrides (0014). No table grant exists
-- on that table (RPC-only by design), so this is the only way a row gets
-- written.

create or replace function public.set_group_visibility(
  p_group_id uuid,
  p_hidden boolean,
  p_duration_minutes int default null,
  p_timezone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires_at timestamptz;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can change visibility for this group.';
  end if;

  if not p_hidden then
    insert into public.group_visibility_overrides (group_id, user_id, event_type, expires_at)
    values (p_group_id, auth.uid(), 'unhide', null);
    return;
  end if;

  if p_duration_minutes is not null then
    v_expires_at := now() + make_interval(mins => p_duration_minutes);
  elsif p_timezone is not null then
    -- "All day": next local midnight in the timezone sent at write time,
    -- computed once here and never recomputed later (accepted edge case
    -- #3 — a mid-hide timezone change doesn't shift an already-set
    -- expires_at). AT TIME ZONE round-trip: timestamptz -> local wall
    -- clock -> truncate/advance a day -> reinterpret as that zone's wall
    -- clock, back to timestamptz.
    v_expires_at := (date_trunc('day', now() at time zone p_timezone) + interval '1 day')
      at time zone p_timezone;
  else
    v_expires_at := null;
  end if;

  insert into public.group_visibility_overrides (group_id, user_id, event_type, expires_at)
  values (p_group_id, auth.uid(), 'hide', v_expires_at);
end;
$$;

-- No explicit grant execute statement: Postgres grants EXECUTE on new
-- functions to PUBLIC by default and nothing here revokes it — same as
-- every other RPC in this codebase (create_group, send_invite, etc.),
-- none of which carry an explicit grant either.
