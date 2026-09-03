-- supabase/migrations/0017_grant_service_role_selects.sql
-- Same gap as 0016, on the other tables geofence-alert-push's
-- service-role client touches: group_members and profiles never
-- granted service_role SELECT either, and push_tokens never granted
-- service_role SELECT/DELETE (needed for its stale-token pruning).
grant select on public.group_members to service_role;
grant select on public.profiles to service_role;
grant select, delete on public.push_tokens to service_role;
