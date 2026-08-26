// features/geofencing/hooks/useGeofenceDetection.ts
import type * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import { distanceMeters } from '../distance';
import type { Geofence, GeofenceCrossing } from '../types/geofence.types';

type UseGeofenceDetectionResult = {
  latestCrossing: GeofenceCrossing | null;
};

/**
 * Compares live coords against the active group's zones, tracking each
 * zone's inside/outside state in a ref so it survives re-renders without
 * re-baselining. A zone's first fix is a silent baseline (no event) —
 * only a later state *change* produces a crossing. Zones no longer in
 * `geofences` are pruned so a deleted/switched-away-from zone can't
 * produce a stale exit later.
 */
export const useGeofenceDetection = (
  coords: Location.LocationObjectCoords | null,
  timestamp: number | null,
  geofences: Geofence[],
): UseGeofenceDetectionResult => {
  const [latestCrossing, setLatestCrossing] = useState<GeofenceCrossing | null>(null);
  const trackingRef = useRef<Map<string, boolean>>(new Map());

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

    for (const geofence of geofences) {
      const isInside =
        distanceMeters(coords, { latitude: geofence.latitude, longitude: geofence.longitude }) <=
        geofence.radiusM;
      const wasInside = trackingMap.get(geofence.id);

      if (wasInside === undefined) {
        trackingMap.set(geofence.id, isInside);
        continue;
      }

      if (wasInside === isInside) {
        continue;
      }

      trackingMap.set(geofence.id, isInside);

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
