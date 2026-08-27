// features/geofencing/hooks/useBackgroundGeofenceRegistration.ts
import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { BACKGROUND_GEOFENCE_TASK_NAME, MAX_MONITORED_GEOFENCES } from '../../../lib/constants';
import type { Geofence } from '../types/geofence.types';
import type { BackgroundGeofencePermissionState } from './useBackgroundGeofencePermission';

/**
 * Keeps native region monitoring exclusively a background-mode thing:
 * starts on transition to `background`, stops on transition back to
 * `active` so FT-16's foreground JS loop stays the sole detector while open.
 */
export const useBackgroundGeofenceRegistration = (
  activeGroupId: string | null,
  geofences: Geofence[],
  permissionStatus: BackgroundGeofencePermissionState,
): void => {
  // Subscription is set up once; these refs keep its closure current.
  const activeGroupIdRef = useRef(activeGroupId);
  const geofencesRef = useRef(geofences);
  const permissionStatusRef = useRef(permissionStatus);

  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  useEffect(() => {
    geofencesRef.current = geofences;
  }, [geofences]);

  useEffect(() => {
    permissionStatusRef.current = permissionStatus;
  }, [permissionStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        startMonitoring(
          activeGroupIdRef.current,
          geofencesRef.current,
          permissionStatusRef.current,
        );
        return;
      }

      if (nextState === 'active') {
        Location.stopGeofencingAsync(BACKGROUND_GEOFENCE_TASK_NAME).catch(() => {
          // No-op if monitoring wasn't running (e.g. permission was never granted).
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
};

const startMonitoring = (
  activeGroupId: string | null,
  geofences: Geofence[],
  permissionStatus: BackgroundGeofencePermissionState,
): void => {
  if (permissionStatus !== 'granted' || !activeGroupId || geofences.length === 0) {
    return;
  }

  // Sort by id to keep a stable order, because iOS only monitors up to MAX_MONITORED_GEOFENCES regions.
  const regions = [...geofences]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, MAX_MONITORED_GEOFENCES)
    .map((geofence) => ({
      identifier: geofence.id,
      latitude: geofence.latitude,
      longitude: geofence.longitude,
      radius: geofence.radiusM,
    }));

  Location.startGeofencingAsync(BACKGROUND_GEOFENCE_TASK_NAME, regions).catch((error) => {
    console.warn('[geofencing] startGeofencingAsync failed:', error);
  });
};
