// features/geofencing/hooks/useLogGeofenceEvent.ts
import { useEffect } from 'react';

import { logGeofenceEvent } from '../lib/logGeofenceEvent';
import type { GeofenceCrossing } from '../types/geofence.types';

/** Inserts one geofence_events row per foreground-detected crossing (self-only, FT-16). */
export const useLogGeofenceEvent = (
  crossing: GeofenceCrossing | null,
  userId: string | null,
): void => {
  useEffect(() => {
    if (!crossing || !userId) {
      return;
    }

    logGeofenceEvent(crossing, userId);
  }, [crossing, userId]);
};
