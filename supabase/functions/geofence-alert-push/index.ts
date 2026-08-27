// supabase/functions/geofence-alert-push/index.ts
// FT-17: Database Webhook target for geofence_events INSERT. Second
// delivery path off the same write FT-16 already alerts on in-app --
// reaches members whose app isn't foregrounded/subscribed.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { sendPushNotification } from '../_shared/sendPush.ts';

type GeofenceEventRow = {
  id: string;
  geofence_id: string;
  user_id: string;
  event_type: 'enter' | 'exit';
  occurred_at: string;
};

type WebhookPayload = {
  type: 'INSERT';
  table: 'geofence_events';
  record: GeofenceEventRow;
};

const getServiceRoleClient = () => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  return createClient(url, serviceRoleKey);
};

Deno.serve(async (req: Request) => {
  const expectedSecret = Deno.env.get('GEOFENCE_WEBHOOK_SECRET');
  const providedSecret = req.headers.get('x-webhook-secret');

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { record } = (await req.json()) as WebhookPayload;
  const supabase = getServiceRoleClient();

  const { data: geofence } = await supabase
    .from('geofences')
    .select('name, group_id')
    .eq('id', record.geofence_id)
    .maybeSingle();

  // Deleted in the race between insert and webhook firing -- no-op.
  if (!geofence) {
    return new Response('ok', { status: 200 });
  }

  const { data: crosser } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', record.user_id)
    .maybeSingle();

  const { data: recipients } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', geofence.group_id)
    .neq('user_id', record.user_id);

  const recipientIds = (recipients ?? []).map((row) => row.user_id as string);

  // Sole member of the group -- no one else to notify.
  if (recipientIds.length === 0) {
    return new Response('ok', { status: 200 });
  }

  const displayName = crosser?.display_name ?? 'Someone';
  const action = record.event_type === 'enter' ? 'entered' : 'left';

  await sendPushNotification({
    userIds: recipientIds,
    title: `${displayName} ${action} ${geofence.name}`,
    body: `${displayName} ${action} ${geofence.name}`,
    data: {
      type: 'geofence_alert',
      geofenceId: record.geofence_id,
      eventType: record.event_type,
      userId: record.user_id,
      occurredAt: record.occurred_at,
    },
  });

  return new Response('ok', { status: 200 });
});
