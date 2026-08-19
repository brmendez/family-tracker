-- supabase/migrations/0007_leave_group_owner_guard.sql
-- FT-11: blocks an owner from leaving a group that still has other
-- members, which would otherwise leave the group ownerless (no row
-- satisfies is_group_owner, breaking decision #1's owner-only checks).
-- No new tables/RPCs — the client uses the same raw group_members delete
-- group_members_delete_self_or_owner (0004_groups.sql) already permits;
-- this BEFORE DELETE trigger is the only addition. FT-7's AFTER DELETE
-- delete_group_if_empty trigger is unchanged and still runs afterward for
-- deletes this trigger allows.

create or replace function public.prevent_ownerless_group_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_members int;
begin
  if old.role <> 'owner' then
    return old;
  end if;

  select count(*) into other_members
  from public.group_members
  where group_id = old.group_id
    and user_id <> old.user_id;

  if other_members > 0 then
    raise exception 'An owner cannot leave a group that still has other members.';
  end if;

  return old;
end;
$$;

drop trigger if exists group_members_prevent_ownerless_leave on public.group_members;

create trigger group_members_prevent_ownerless_leave
  before delete on public.group_members
  for each row
  execute function public.prevent_ownerless_group_leave();
