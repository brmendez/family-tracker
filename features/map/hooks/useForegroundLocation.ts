// features/map/hooks/useForegroundLocation.ts
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import {
  LOCATION_WATCH_DISTANCE_INTERVAL_M,
  LOCATION_WATCH_TIME_INTERVAL_MS,
} from '../../../lib/constants';

type UseForegroundLocationResult = {
  coords: Location.LocationObjectCoords | null;
  // The time the GPS fix itself was taken (location.timestamp, ms since
  // epoch), not the time it was received/processed. FT-5 needs this to
  // record recorded_at accurately in location_history.
  timestamp: number | null;
  errorMessage: string | null;
};

// Wraps expo-location's watchPositionAsync for foreground-only tracking.
// Callers are expected to only render this once foreground permission has
// already been granted (see LocationPermissionGate) — this hook does not
// request permission itself. Background location is explicitly out of
// scope here; see FT-18.
export function useForegroundLocation(): UseForegroundLocationResult {
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(
    null,
  );
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function startWatching() {
      try {
        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.LocationAccuracy.Balanced,
            timeInterval: LOCATION_WATCH_TIME_INTERVAL_MS,
            distanceInterval: LOCATION_WATCH_DISTANCE_INTERVAL_M,
          },
          (location) => {
            if (!isMounted) {
              return;
            }

            setCoords(location.coords);
            setTimestamp(location.timestamp);
          },
        );

        if (!isMounted) {
          subscription.remove();

          return;
        }

        subscriptionRef.current = subscription;
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage((error as Error).message);
      }
    }

    startWatching();

    return () => {
      isMounted = false;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, []);

  return { coords, timestamp, errorMessage };
}
