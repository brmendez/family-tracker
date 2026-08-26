// features/geofencing/hooks/useLogGeofenceEvent.ts
import { useEffect } from 'react';

import { supabase } from '../../../lib/supabase';
import type { GeofenceCrossing } from '../types/geofence.types';

/**
 * Inserts one geofence_events row per crossing (self-only, FT-16). Mirrors
 * useLocationHistoryWriter: insert failures are logged and swallowed — a
 * missed event log shouldn't block the map or the alert.
 */
export const useLogGeofenceEvent = (
  crossing: GeofenceCrossing | null,
  userId: string | null,
): void => {
  useEffect(() => {
    if (!crossing || !userId) {
      return;
    }

    const logEvent = async () => {
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

    logEvent();
  }, [crossing, userId]);
};
