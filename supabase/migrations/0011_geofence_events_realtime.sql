-- supabase/migrations/0011_geofence_events_realtime.sql
-- FT-16: enable Postgres Realtime replication on geofence_events so
-- useGeofenceAlert can subscribe to postgres_changes (INSERT) events.
-- FT-13's schema migration (0009) added RLS and grants but never added
-- this table to the realtime publication -- same gap 0003 closed for
-- location_history. Only INSERT is relevant: the table is append-only
-- (no update/delete grant), and default replica identity (primary key)
-- is sufficient for INSERT payloads to include the full new row.

alter publication supabase_realtime add table public.geofence_events;
