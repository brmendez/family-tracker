// features/geofencing/lib/geofenceRegistrationTracker.ts
import { GEOFENCE_REGISTRATION_SUPPRESS_WINDOW_MS } from '../../../lib/constants';

// In-memory only (FT-34): the hook (writer) and the headless background task
// (reader) are separate modules with no other shared state, and a real
// re-registration can only happen while this same JS process is alive anyway.
let lastSignature: string | null = null;
let lastRegisteredAt: number | null = null;

export const recordGeofenceRegistration = (signature: string): void => {
  lastSignature = signature;
  lastRegisteredAt = Date.now();
};

export const getLastRegisteredSignature = (): string | null => lastSignature;

// FT-34 fix: called after stopGeofencingAsync so a later re-add of zones
// registers fresh instead of no-op matching a stale signature.
export const clearGeofenceRegistration = (): void => {
  lastSignature = null;
  lastRegisteredAt = null;
};

// True while a callback landing now is more likely iOS's synchronous
// initial-membership report from the last real startGeofencingAsync call
// than an actual crossing.
export const isWithinRegistrationSuppressWindow = (now: number = Date.now()): boolean => {
  if (lastRegisteredAt === null) {
    return false;
  }

  return now - lastRegisteredAt < GEOFENCE_REGISTRATION_SUPPRESS_WINDOW_MS;
};
