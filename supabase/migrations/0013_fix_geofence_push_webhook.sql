-- supabase/migrations/0013_fix_geofence_push_webhook.sql
-- 0012 was applied with its <PROJECT_REF>/<GEOFENCE_WEBHOOK_SECRET>
-- placeholders left in literally, so the trigger was POSTing to a bogus
-- hostname. Recreate it with the real project ref and secret.
drop trigger if exists geofence_events_push_webhook on public.geofence_events;
create trigger geofence_events_push_webhook
  after insert on public.geofence_events
  for each row
  execute function supabase_functions.http_request(
    'https://whtmweacnfugwmvcijfj.supabase.co/functions/v1/geofence-alert-push',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"***REMOVED-LEAKED-SECRET***"}',
    '{}',
    '5000'
  );
