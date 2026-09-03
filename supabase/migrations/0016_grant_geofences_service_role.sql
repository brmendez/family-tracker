-- supabase/migrations/0016_grant_geofences_service_role.sql
-- 0009 never granted service_role SELECT on geofences, so
-- geofence-alert-push's service-role client got "permission denied"
-- on every invocation (RLS bypass doesn't skip base table grants).
grant select on public.geofences to service_role;
