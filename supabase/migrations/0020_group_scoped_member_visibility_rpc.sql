-- supabase/migrations/0020_group_scoped_member_visibility_rpc.sql
-- FT-38: get_visible_group_members — fixes per-group hide (FT-20) leaking
-- through shares_visible_group_with's blanket "any shared unhidden group"
-- OR. location_history's RLS stays untouched (still the correct coarse
-- "can ever read this row" gate); this instead scopes the member list
-- useActiveGroupMembers builds per active group, which useGroupMemberLocations
-- (FT-12) already keys its realtime filtering off of.

create or replace function public.get_visible_group_members(p_group_id uuid)
returns table (user_id uuid, display_name text, avatar_color text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Only group members can view this group''s members.';
  end if;

  return query
    select gm.user_id, p.display_name, p.avatar_color
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    where gm.group_id = p_group_id
      and gm.user_id <> auth.uid()
      and not public.is_hidden_from_group(gm.user_id, p_group_id)
      and not public.is_globally_hidden(gm.user_id);
end;
$$;

-- No explicit grant execute statement: same default-PUBLIC-EXECUTE
-- precedent as every other RPC in this codebase (set_group_visibility,
-- set_global_visibility, etc.).
