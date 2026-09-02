// features/geofencing/hooks/useGeofenceDetection.ts
import type * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import { GEOFENCE_CONFIRMATION_COUNT, GEOFENCE_MIN_ACCURACY_M } from '../../../lib/constants';
import { distanceMeters } from '../distance';
import type { Geofence, GeofenceCrossing } from '../types/geofence.types';

type UseGeofenceDetectionResult = {
  latestCrossing: GeofenceCrossing | null;
};

// FT-33: confirmed is the last committed state; pending/pendingCount track
// consecutive agreeing readings toward the next state flip.
type TrackingEntry = {
  confirmed: boolean;
  pending: boolean;
  pendingCount: number;
};

/**
 * Compares live coords against the active group's zones, tracking each
 * zone's inside/outside state in a ref so it survives re-renders without
 * re-baselining. A zone's first accurate-enough fix is a silent baseline
 * (no event) — a later state change only fires once GEOFENCE_CONFIRMATION_COUNT
 * consecutive fixes agree, guarding against a single noisy GPS fix (FT-33).
 * Zones no longer in `geofences` are pruned so a deleted/switched-away-from
 * zone can't produce a stale exit later.
 */
export const useGeofenceDetection = (
  coords: Location.LocationObjectCoords | null,
  timestamp: number | null,
  geofences: Geofence[],
): UseGeofenceDetectionResult => {
  const [latestCrossing, setLatestCrossing] = useState<GeofenceCrossing | null>(null);
  const trackingRef = useRef<Map<string, TrackingEntry>>(new Map());

  useEffect(() => {
    const currentIds = new Set(geofences.map((geofence) => geofence.id));
    const trackingMap = trackingRef.current;

    for (const id of trackingMap.keys()) {
      if (!currentIds.has(id)) {
        trackingMap.delete(id);
      }
    }

    if (!coords || !timestamp) {
      return;
    }

    // A fix this imprecise can't be trusted to place the device inside or
    // outside a zone — skip it entirely rather than treat it as a reading.
    if (coords.accuracy === null || coords.accuracy > GEOFENCE_MIN_ACCURACY_M) {
      return;
    }

    for (const geofence of geofences) {
      const isInside =
        distanceMeters(coords, { latitude: geofence.latitude, longitude: geofence.longitude }) <=
        geofence.radiusM;
      const entry = trackingMap.get(geofence.id);

      if (entry === undefined) {
        trackingMap.set(geofence.id, { confirmed: isInside, pending: isInside, pendingCount: 1 });
        continue;
      }

      if (entry.confirmed === isInside) {
        entry.pending = isInside;
        entry.pendingCount = 1;
        continue;
      }

      if (entry.pending !== isInside) {
        entry.pending = isInside;
        entry.pendingCount = 1;
        continue;
      }

      entry.pendingCount += 1;

      if (entry.pendingCount < GEOFENCE_CONFIRMATION_COUNT) {
        continue;
      }

      entry.confirmed = isInside;

      setLatestCrossing({
        geofenceId: geofence.id,
        geofenceName: geofence.name,
        eventType: isInside ? 'enter' : 'exit',
        occurredAt: new Date(timestamp).toISOString(),
      });
    }
  }, [coords, timestamp, geofences]);

  return { latestCrossing };
};
