// features/map/hooks/useLocationPermission.ts
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

export type LocationPermissionState =
  | 'checking'
  | 'undetermined'
  | 'granted'
  | 'denied';

type UseLocationPermissionResult = {
  status: LocationPermissionState;
  requestPermission: () => Promise<void>;
};

// Wraps expo-location's foreground permission APIs and exposes a single
// status enum that distinguishes "not yet asked" from "explicitly denied" —
// on iOS, requestForegroundPermissionsAsync() will only ever show the system
// prompt once. After a denial, canAskAgain flips to false and the call
// resolves immediately with the same denied status instead of re-prompting,
// so callers must route the user to Settings instead (see
// LocationPermissionGate).
export function useLocationPermission(): UseLocationPermissionResult {
  const [status, setStatus] = useState<LocationPermissionState>('checking');

  const refreshStatus = useCallback(async () => {
    const response = await Location.getForegroundPermissionsAsync();

    setStatus(toPermissionState(response));
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const requestPermission = useCallback(async () => {
    const response = await Location.requestForegroundPermissionsAsync();

    setStatus(toPermissionState(response));
  }, []);

  return { status, requestPermission };
}

function toPermissionState(
  response: Location.LocationPermissionResponse,
): LocationPermissionState {
  if (response.status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (!response.canAskAgain) {
    return 'denied';
  }

  return 'undetermined';
}
