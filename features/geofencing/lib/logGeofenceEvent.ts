// features/geofencing/lib/logGeofenceEvent.ts
import { supabase } from '../../../lib/supabase';
import type { GeofenceCrossing } from '../types/geofence.types';

// geofenceName isn't a column on geofence_events — omitted so the background
// task (which doesn't resolve it) doesn't need a placeholder value.
type GeofenceEventInsert = Omit<GeofenceCrossing, 'geofenceName'>;

// Shared geofence_events insert (foreground hook + background task); errors are swallowed.
export const logGeofenceEvent = async (
  crossing: GeofenceEventInsert,
  userId: string,
): Promise<void> => {
  const { error } = await supabase.from('geofence_events').insert({
    geofence_id: crossing.geofenceId,
    user_id: userId,
    event_type: crossing.eventType,
    occurred_at: crossing.occurredAt,
  });

  if (error) {
    console.warn('[geofence-events] insert failed:', error.message);
  }
};
