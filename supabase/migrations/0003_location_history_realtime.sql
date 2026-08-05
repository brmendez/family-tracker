-- supabase/migrations/0003_location_history_realtime.sql
-- FT-6: enable Postgres Realtime replication on location_history so
-- clients can subscribe to postgres_changes (INSERT) events. Only INSERT
-- is relevant -- the table is append-only (no update/delete grant, see
-- FT-5's migration), and default replica identity (primary key) is
-- sufficient for INSERT payloads to include the full new row.

alter publication supabase_realtime add table public.location_history;
