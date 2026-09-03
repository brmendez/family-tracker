-- supabase/migrations/0019_set_global_visibility_rpc.sql
-- FT-21: set_global_visibility — the single write path for every hide
-- duration into global_visibility_overrides (0018). No table grant exists
-- on that table (RPC-only by design), so this is the only way a row gets
-- written. Mirrors FT-20's set_group_visibility, minus the group scoping —
-- this is a self-only action, so no membership check is needed.

create or replace function public.set_global_visibility(
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
  if not p_hidden then
    insert into public.global_visibility_overrides (user_id, event_type, expires_at)
    values (auth.uid(), 'unhide', null);
    return;
  end if;

  if p_duration_minutes is not null then
    v_expires_at := now() + make_interval(mins => p_duration_minutes);
  elsif p_timezone is not null then
    -- "All day": same AT TIME ZONE round-trip as set_group_visibility.
    v_expires_at := (date_trunc('day', now() at time zone p_timezone) + interval '1 day')
      at time zone p_timezone;
  else
    v_expires_at := null;
  end if;

  insert into public.global_visibility_overrides (user_id, event_type, expires_at)
  values (auth.uid(), 'hide', v_expires_at);
end;
$$;

-- No explicit grant execute statement: Postgres grants EXECUTE on new
-- functions to PUBLIC by default and nothing here revokes it — same as
-- every other RPC in this codebase.
