-- supabase/migrations/0012_geofence_push_webhook.sql
-- FT-17: Database Webhook firing on every geofence_events INSERT, POSTing
-- to the geofence-alert-push edge function so members whose app isn't
-- foregrounded (FT-16's realtime path doesn't reach them) still get a
-- push. Ticket named this 0011_geofence_push_webhook.sql, but 0011 was
-- already taken by FT-16's 0011_geofence_events_realtime.sql by the time
-- this landed -- numbered 0012 instead, no other deviation.

-- Shared secret the edge function checks against an incoming header, so
-- the endpoint can't be hit by anyone who guesses the project's URL.
-- Set the real value via `supabase secrets set GEOFENCE_WEBHOOK_SECRET=...`
-- (edge function side) and as this trigger's header value (below) --
-- both must match. Placeholder here is intentionally not a real secret;
-- replace before applying to a live project.
drop trigger if exists geofence_events_push_webhook on public.geofence_events;
create trigger geofence_events_push_webhook
  after insert on public.geofence_events
  for each row
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/geofence-alert-push',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<GEOFENCE_WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );
