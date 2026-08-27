// features/geofencing/hooks/useBackgroundGeofencePermission.ts
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

export type BackgroundGeofencePermissionState =
  | 'checking'
  | 'undetermined'
  | 'granted'
  | 'denied';

type UseBackgroundGeofencePermissionResult = {
  status: BackgroundGeofencePermissionState;
  requestPermission: () => Promise<void>;
};

/**
 * Mirrors useLocationPermission's shape over the "Always" (background)
 * permission APIs — iOS shows its own upgrade prompt only once, so a
 * denial routes callers to Settings rather than re-prompting.
 */
export const useBackgroundGeofencePermission = (): UseBackgroundGeofencePermissionResult => {
  const [status, setStatus] = useState<BackgroundGeofencePermissionState>('checking');

  const refreshStatus = useCallback(async () => {
    const response = await Location.getBackgroundPermissionsAsync();

    setStatus(toPermissionState(response));
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const requestPermission = useCallback(async () => {
    const response = await Location.requestBackgroundPermissionsAsync();

    setStatus(toPermissionState(response));
  }, []);

  return { status, requestPermission };
};

const toPermissionState = (
  response: Location.PermissionResponse,
): BackgroundGeofencePermissionState => {
  if (response.status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (!response.canAskAgain) {
    return 'denied';
  }

  return 'undetermined';
};
