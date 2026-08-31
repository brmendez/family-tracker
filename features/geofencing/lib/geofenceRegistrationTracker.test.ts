// features/geofencing/lib/geofenceRegistrationTracker.test.ts
import {
  recordGeofenceRegistration,
  getLastRegisteredSignature,
  clearGeofenceRegistration,
  isWithinRegistrationSuppressWindow,
} from './geofenceRegistrationTracker';
import { GEOFENCE_REGISTRATION_SUPPRESS_WINDOW_MS } from '../../../lib/constants';

describe('geofenceRegistrationTracker', () => {
  beforeEach(() => {
    // Reset module state between tests by clearing
    clearGeofenceRegistration();
  });

  describe('recordGeofenceRegistration', () => {
    it('records a signature and timestamp', () => {
      const signature = 'zone-1:37.7749:-122.4194:100|zone-2:40.7128:-74.006:150';

      recordGeofenceRegistration(signature);

      expect(getLastRegisteredSignature()).toBe(signature);
    });

    it('overwrites previous signature on second call', () => {
      recordGeofenceRegistration('old-sig');
      recordGeofenceRegistration('new-sig');

      expect(getLastRegisteredSignature()).toBe('new-sig');
    });
  });

  describe('getLastRegisteredSignature', () => {
    it('returns null when nothing has been recorded', () => {
      expect(getLastRegisteredSignature()).toBeNull();
    });

    it('returns the recorded signature', () => {
      const signature = 'zone-1:37.7749:-122.4194:100';
      recordGeofenceRegistration(signature);

      expect(getLastRegisteredSignature()).toBe(signature);
    });
  });

  describe('clearGeofenceRegistration', () => {
    it('clears the signature', () => {
      recordGeofenceRegistration('zone-1:37.7749:-122.4194:100');

      clearGeofenceRegistration();

      expect(getLastRegisteredSignature()).toBeNull();
    });

    it('clears the suppress window', () => {
      recordGeofenceRegistration('zone-1:37.7749:-122.4194:100');
      const now = Date.now();

      clearGeofenceRegistration();

      // Should immediately return false since there's no recorded time
      expect(isWithinRegistrationSuppressWindow(now + 1000)).toBe(false);
    });
  });

  describe('isWithinRegistrationSuppressWindow', () => {
    it('returns false when nothing has been recorded', () => {
      expect(isWithinRegistrationSuppressWindow()).toBe(false);
    });

    it('returns true immediately after recording (within window)', () => {
      const recordTime = Date.now();
      recordGeofenceRegistration('zone-1:37.7749:-122.4194:100');

      const checkTime = recordTime + GEOFENCE_REGISTRATION_SUPPRESS_WINDOW_MS / 2;
      expect(isWithinRegistrationSuppressWindow(checkTime)).toBe(true);
    });

    it('returns true at the edge of the window', () => {
      const recordTime = Date.now();
      recordGeofenceRegistration('zone-1:37.7749:-122.4194:100');

      const checkTime = recordTime + GEOFENCE_REGISTRATION_SUPPRESS_WINDOW_MS - 1;
      expect(isWithinRegistrationSuppressWindow(checkTime)).toBe(true);
    });

    it('returns false after the window expires', () => {
      const recordTime = Date.now();
      recordGeofenceRegistration('zone-1:37.7749:-122.4194:100');

      const checkTime = recordTime + GEOFENCE_REGISTRATION_SUPPRESS_WINDOW_MS + 1;
      expect(isWithinRegistrationSuppressWindow(checkTime)).toBe(false);
    });

    it('uses current time when no argument is provided', () => {
      recordGeofenceRegistration('zone-1:37.7749:-122.4194:100');

      // Called immediately after record, should be within window
      expect(isWithinRegistrationSuppressWindow()).toBe(true);
    });

    it('handles the case where a real crossing lands inside the suppress window', () => {
      recordGeofenceRegistration('zone-1:37.7749:-122.4194:100');

      // Simulate a crossing callback arriving 2 seconds after registration
      const checkTime = Date.now() + 2000;
      expect(isWithinRegistrationSuppressWindow(checkTime)).toBe(true);
    });
  });
});
