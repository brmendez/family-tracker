-- supabase/migrations/0015_rotate_geofence_webhook_secret.sql
-- 0013's secret was committed in plaintext and pushed to a public repo
-- (flagged by GitGuardian 2026-09-02). Rotate it. Do NOT commit the real
-- value here -- replace <GEOFENCE_WEBHOOK_SECRET> with the new secret
-- when applying this migration by hand, same as 0013's own fix.
drop trigger if exists geofence_events_push_webhook on public.geofence_events;
create trigger geofence_events_push_webhook
  after insert on public.geofence_events
  for each row
  execute function supabase_functions.http_request(
    'https://whtmweacnfugwmvcijfj.supabase.co/functions/v1/geofence-alert-push',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<GEOFENCE_WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );
