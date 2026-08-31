// features/geofencing/hooks/useBackgroundGeofenceRegistration.ts
import * as Location from 'expo-location';
import { useEffect } from 'react';

import { BACKGROUND_GEOFENCE_TASK_NAME, MAX_MONITORED_GEOFENCES } from '../../../lib/constants';
import {
  clearGeofenceRegistration,
  getLastRegisteredSignature,
  recordGeofenceRegistration,
} from '../lib/geofenceRegistrationTracker';
import type { Geofence } from '../types/geofence.types';
import type { BackgroundGeofencePermissionState } from './useBackgroundGeofencePermission';

/**
 * FT-34: registers native region monitoring once permission/zones are ready
 * and leaves it running continuously — no longer tied to AppState, since
 * stop/restart per foreground flip made iOS re-report every region's current
 * membership as a fresh crossing. Re-registers only when the target region
 * set actually changes.
 */
export const useBackgroundGeofenceRegistration = (
  activeGroupId: string | null,
  geofences: Geofence[],
  permissionStatus: BackgroundGeofencePermissionState,
): void => {
  useEffect(() => {
    if (permissionStatus !== 'granted' || !activeGroupId || geofences.length === 0) {
      // Nothing to monitor — stop rather than leave a stale registration running.
      if (getLastRegisteredSignature() !== null) {
        Location.stopGeofencingAsync(BACKGROUND_GEOFENCE_TASK_NAME)
          .then(() => {
            clearGeofenceRegistration();
          })
          .catch((error) => {
            console.warn('[geofencing] stopGeofencingAsync failed:', error);
          });
      }

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

    const signature = regions
      .map((region) => `${region.identifier}:${region.latitude}:${region.longitude}:${region.radius}`)
      .join('|');

    if (signature === getLastRegisteredSignature()) {
      return;
    }

    Location.startGeofencingAsync(BACKGROUND_GEOFENCE_TASK_NAME, regions)
      .then(() => {
        recordGeofenceRegistration(signature);
      })
      .catch((error) => {
        console.warn('[geofencing] startGeofencingAsync failed:', error);
      });
  }, [activeGroupId, geofences, permissionStatus]);
};
