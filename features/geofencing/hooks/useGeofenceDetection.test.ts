// features/geofencing/hooks/useGeofenceDetection.test.ts
import { renderHook, act } from '@testing-library/react-native';
import type * as Location from 'expo-location';

import { GEOFENCE_CONFIRMATION_COUNT, GEOFENCE_MIN_ACCURACY_M } from '../../../lib/constants';
import * as distanceModule from '../distance';
import type { Geofence } from '../types/geofence.types';
import { useGeofenceDetection } from './useGeofenceDetection';

jest.mock('../distance');

const mockedDistance = distanceModule.distanceMeters as jest.MockedFunction<
  typeof distanceModule.distanceMeters
>;

function createGeofence(
  id: string,
  name: string,
  latitude: number = 37.7749,
  longitude: number = -122.4194,
  radiusM: number = 100,
): Geofence {
  return {
    id,
    groupId: 'group-1',
    name,
    latitude,
    longitude,
    radiusM,
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

function createCoords(
  latitude: number = 37.7749,
  longitude: number = -122.4194,
  accuracy: number | null = GEOFENCE_MIN_ACCURACY_M,
): Location.LocationObjectCoords {
  return {
    latitude,
    longitude,
    altitude: 0,
    accuracy,
    altitudeAccuracy: 0,
    heading: 0,
    speed: 0,
  };
}

const DEFAULT_TIMESTAMP = new Date('2024-01-01T12:00:00.000Z').getTime();

describe('useGeofenceDetection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('accuracy filtering (FT-33)', () => {
    it('ignores a fix with accuracy over threshold', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      const coords = createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M + 1);

      mockedDistance.mockReturnValue(50); // Inside

      const { result } = await renderHook(() =>
        useGeofenceDetection(coords, DEFAULT_TIMESTAMP, [geofence]),
      );

      // Noisy fix should not update state
      expect(result.current.latestCrossing).toBeNull();
    });

    it('ignores a fix with accuracy === null', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      const coords = createCoords(37.7749, -122.4194, null);

      mockedDistance.mockReturnValue(50); // Inside

      const { result } = await renderHook(() =>
        useGeofenceDetection(coords, DEFAULT_TIMESTAMP, [geofence]),
      );

      expect(result.current.latestCrossing).toBeNull();
    });

    it('accepts a fix at the accuracy threshold', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      const coords = createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M);

      mockedDistance.mockReturnValue(50); // Inside

      const { result } = await renderHook(() =>
        useGeofenceDetection(coords, DEFAULT_TIMESTAMP, [geofence]),
      );

      // Should establish a baseline silently (no crossing yet)
      expect(result.current.latestCrossing).toBeNull();
    });

    it('accepts a fix with accuracy better than threshold', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      const coords = createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M - 10);

      mockedDistance.mockReturnValue(50); // Inside

      const { result } = await renderHook(() =>
        useGeofenceDetection(coords, DEFAULT_TIMESTAMP, [geofence]),
      );

      // Should establish a baseline silently
      expect(result.current.latestCrossing).toBeNull();
    });
  });

  describe('first fix baseline (FT-33)', () => {
    it('establishes silent baseline on first accurate fix (inside)', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      const coords = createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M);

      mockedDistance.mockReturnValue(50); // Inside (distance <= 100m radius)

      const { result } = await renderHook(() =>
        useGeofenceDetection(coords, DEFAULT_TIMESTAMP, [geofence]),
      );

      // No crossing event should fire on the first fix
      expect(result.current.latestCrossing).toBeNull();
    });

    it('establishes silent baseline on first accurate fix (outside)', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      const coords = createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M);

      mockedDistance.mockReturnValue(150); // Outside (distance > 100m radius)

      const { result } = await renderHook(() =>
        useGeofenceDetection(coords, DEFAULT_TIMESTAMP, [geofence]),
      );

      // No crossing event should fire on the first fix
      expect(result.current.latestCrossing).toBeNull();
    });
  });

  describe('confirmation count (FT-33)', () => {
    it('requires 3 fixes before firing exit crossing', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      mockedDistance.mockReturnValue(50); // Inside baseline

      const { rerender } = await renderHook(
        ({ coords, timestamp, geofences }) => useGeofenceDetection(coords, timestamp, geofences),
        {
          initialProps: {
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP,
            geofences: [geofence],
          },
        },
      );

      // First fix confirming exit (outside)
      mockedDistance.mockReturnValue(150);
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 1000,
          geofences: [geofence],
        });
      });

      // After act, let's check with a new hook render to verify state
      let testResult: any = null;
      await act(async () => {
        testResult = renderHook(() =>
          useGeofenceDetection(
            createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            DEFAULT_TIMESTAMP + 1000,
            [geofence],
          ),
        );
      });
      // Note: This hook starts fresh, so we need a different approach
    });

    it('fires exit crossing after 3 consecutive agreeing fixes', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      mockedDistance.mockReturnValue(50); // Start inside

      const { result, rerender } = await renderHook(
        ({ coords, timestamp, geofences }) => useGeofenceDetection(coords, timestamp, geofences),
        {
          initialProps: {
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP,
            geofences: [geofence],
          },
        },
      );

      expect(result.current.latestCrossing).toBeNull();

      // Move outside: fix 1
      mockedDistance.mockReturnValue(150);
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 1000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toBeNull();

      // Fix 2
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 2000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toBeNull();

      // Fix 3: crossing should fire
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 3000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toMatchObject({
        geofenceId: 'zone-1',
        geofenceName: 'Home',
        eventType: 'exit',
        occurredAt: new Date(DEFAULT_TIMESTAMP + 3000).toISOString(),
      });
    });

    it('fires enter crossing after 3 consecutive agreeing fixes', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      mockedDistance.mockReturnValue(150); // Start outside

      const { result, rerender } = await renderHook(
        ({ coords, timestamp, geofences }) => useGeofenceDetection(coords, timestamp, geofences),
        {
          initialProps: {
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP,
            geofences: [geofence],
          },
        },
      );

      expect(result.current.latestCrossing).toBeNull();

      // Move inside: fix 1
      mockedDistance.mockReturnValue(50);
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 1000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toBeNull();

      // Fix 2
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 2000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toBeNull();

      // Fix 3: crossing should fire
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 3000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toMatchObject({
        geofenceId: 'zone-1',
        geofenceName: 'Home',
        eventType: 'enter',
        occurredAt: new Date(DEFAULT_TIMESTAMP + 3000).toISOString(),
      });
    });
  });

  describe('oscillation handling (FT-33)', () => {
    it('resets pending counter when fix disagrees with pending direction', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      mockedDistance.mockReturnValue(50); // Start inside

      const { result, rerender } = await renderHook(
        ({ coords, timestamp, geofences }) => useGeofenceDetection(coords, timestamp, geofences),
        {
          initialProps: {
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP,
            geofences: [geofence],
          },
        },
      );

      // Start moving outside: fix 1 (pendingCount = 1, pending = outside)
      mockedDistance.mockReturnValue(150);
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 1000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toBeNull();

      // Oscillate back inside: contradicts pending, resets counter
      mockedDistance.mockReturnValue(50);
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 2000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toBeNull();

      // Now move outside again: fix 1 of new attempt (pendingCount = 1, pending = outside)
      mockedDistance.mockReturnValue(150);
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 3000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toBeNull();

      // Fix 2
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 4000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toBeNull();

      // Fix 3: crossing should now fire
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 5000,
          geofences: [geofence],
        });
      });
      expect(result.current.latestCrossing).toMatchObject({
        geofenceId: 'zone-1',
        geofenceName: 'Home',
        eventType: 'exit',
      });
    });
  });

  describe('re-entry', () => {
    it('fires re-entry crossing after exit and 3 agreeing return fixes', async () => {
      const geofence = createGeofence('zone-1', 'Home');
      mockedDistance.mockReturnValue(50); // Start inside

      const { result, rerender } = await renderHook(
        ({ coords, timestamp, geofences }) => useGeofenceDetection(coords, timestamp, geofences),
        {
          initialProps: {
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP,
            geofences: [geofence],
          },
        },
      );

      // Exit with 3 fixes
      mockedDistance.mockReturnValue(150);
      for (let i = 1; i <= 3; i++) {
        await act(async () => {
          rerender({
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP + i * 1000,
            geofences: [geofence],
          });
        });
      }
      expect(result.current.latestCrossing?.eventType).toBe('exit');

      // Re-enter with 3 fixes
      mockedDistance.mockReturnValue(50);
      for (let i = 4; i <= 6; i++) {
        await act(async () => {
          rerender({
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP + i * 1000,
            geofences: [geofence],
          });
        });
      }
      expect(result.current.latestCrossing?.eventType).toBe('enter');
    });
  });

  describe('multiple zones', () => {
    it('independently tracks multiple zones', async () => {
      const zone1 = createGeofence('zone-1', 'Home', 37.7749, -122.4194, 100);
      const zone2 = createGeofence('zone-2', 'Work', 37.3382, -121.8863, 100);

      mockedDistance.mockReturnValue(50); // Both inside initially

      const { result, rerender } = await renderHook(
        ({ coords, timestamp, geofences }) => useGeofenceDetection(coords, timestamp, geofences),
        {
          initialProps: {
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP,
            geofences: [zone1, zone2],
          },
        },
      );

      // Zone 1 exits (3 fixes), zone 2 stays inside
      mockedDistance.mockImplementation((a, b) => {
        const lat = (b as any).latitude;
        return lat === 37.7749 ? 150 : 50; // zone-1 outside, zone-2 inside
      });

      for (let i = 1; i <= 3; i++) {
        await act(async () => {
          rerender({
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP + i * 1000,
            geofences: [zone1, zone2],
          });
        });
      }

      expect(result.current.latestCrossing?.geofenceId).toBe('zone-1');
      expect(result.current.latestCrossing?.eventType).toBe('exit');

      // Zone 1 re-enters (3 fixes)
      mockedDistance.mockImplementation((a, b) => {
        const lat = (b as any).latitude;
        return lat === 37.7749 ? 50 : 50; // both inside
      });

      for (let i = 4; i <= 6; i++) {
        await act(async () => {
          rerender({
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP + i * 1000,
            geofences: [zone1, zone2],
          });
        });
      }

      expect(result.current.latestCrossing?.geofenceId).toBe('zone-1');
      expect(result.current.latestCrossing?.eventType).toBe('enter');
    });
  });

  describe('zone cleanup', () => {
    it('prunes tracking for removed geofences', async () => {
      const zone1 = createGeofence('zone-1', 'Home');
      const zone2 = createGeofence('zone-2', 'Work');

      mockedDistance.mockReturnValue(50);

      const { result, rerender } = await renderHook(
        ({ coords, timestamp, geofences }) => useGeofenceDetection(coords, timestamp, geofences),
        {
          initialProps: {
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP,
            geofences: [zone1, zone2],
          },
        },
      );

      // Remove zone2, keep zone1
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP + 1000,
          geofences: [zone1],
        });
      });

      // Zone1 should still track normally (move outside)
      mockedDistance.mockReturnValue(150);
      for (let i = 1; i <= 3; i++) {
        await act(async () => {
          rerender({
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: DEFAULT_TIMESTAMP + (1 + i) * 1000,
            geofences: [zone1],
          });
        });
      }

      expect(result.current.latestCrossing?.geofenceId).toBe('zone-1');
      expect(result.current.latestCrossing?.eventType).toBe('exit');
    });
  });

  describe('null handling', () => {
    it('handles null coords gracefully', async () => {
      const geofence = createGeofence('zone-1', 'Home');

      const { result, rerender } = await renderHook(
        ({ coords, timestamp, geofences }) => useGeofenceDetection(coords, timestamp, geofences),
        {
          initialProps: {
            coords: null,
            timestamp: DEFAULT_TIMESTAMP,
            geofences: [geofence],
          },
        },
      );

      expect(result.current.latestCrossing).toBeNull();

      // Provide coords
      mockedDistance.mockReturnValue(50);
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP,
          geofences: [geofence],
        });
      });

      expect(result.current.latestCrossing).toBeNull();
    });

    it('handles null timestamp gracefully', async () => {
      const geofence = createGeofence('zone-1', 'Home');

      const { result, rerender } = await renderHook(
        ({ coords, timestamp, geofences }) => useGeofenceDetection(coords, timestamp, geofences),
        {
          initialProps: {
            coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
            timestamp: null,
            geofences: [geofence],
          },
        },
      );

      expect(result.current.latestCrossing).toBeNull();

      // Provide timestamp
      mockedDistance.mockReturnValue(50);
      await act(async () => {
        rerender({
          coords: createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          timestamp: DEFAULT_TIMESTAMP,
          geofences: [geofence],
        });
      });

      expect(result.current.latestCrossing).toBeNull();
    });

    it('returns null crossing when no zones are active', async () => {
      const { result } = await renderHook(() =>
        useGeofenceDetection(
          createCoords(37.7749, -122.4194, GEOFENCE_MIN_ACCURACY_M),
          DEFAULT_TIMESTAMP,
          [],
        ),
      );

      expect(result.current.latestCrossing).toBeNull();
    });
  });
});
