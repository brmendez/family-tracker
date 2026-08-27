// features/geofencing/hooks/useBackgroundGeofenceRegistration.test.ts
import { renderHook, act } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { AppState } from 'react-native';

import { BACKGROUND_GEOFENCE_TASK_NAME, MAX_MONITORED_GEOFENCES } from '../../../lib/constants';
import type { Geofence } from '../types/geofence.types';
import { useBackgroundGeofenceRegistration } from './useBackgroundGeofenceRegistration';

jest.mock('expo-location');

const mockedLocation = Location as jest.Mocked<typeof Location>;

function createGeofence(id: string, name: string, lat = 37.7749, lng = -122.4194): Geofence {
  return {
    id,
    groupId: 'group-1',
    name,
    latitude: lat,
    longitude: lng,
    radiusM: 100,
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

describe('useBackgroundGeofenceRegistration', () => {
  let appStateHandler: ((state: any) => void) | null = null;
  let appStateSubscription: any;

  beforeEach(() => {
    jest.clearAllMocks();

    appStateHandler = null;
    appStateSubscription = { remove: jest.fn() };

    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'change') {
        appStateHandler = handler as any;
      }
      return appStateSubscription;
    });

    mockedLocation.startGeofencingAsync.mockResolvedValue(undefined);
    mockedLocation.stopGeofencingAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts monitoring on transition to background with granted permission', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];

    await renderHook(() =>
      useBackgroundGeofenceRegistration('group-1', geofences, 'granted'),
    );

    expect(appStateHandler).not.toBeNull();

    await act(async () => {
      appStateHandler!('background');
    });

    expect(mockedLocation.startGeofencingAsync).toHaveBeenCalledWith(
      BACKGROUND_GEOFENCE_TASK_NAME,
      expect.arrayContaining([
        expect.objectContaining({
          identifier: 'zone-1',
          latitude: 37.7749,
          longitude: -122.4194,
          radius: 100,
        }),
      ]),
    );
  });

  it('stops monitoring on transition to active', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];

    await renderHook(() =>
      useBackgroundGeofenceRegistration('group-1', geofences, 'granted'),
    );

    await act(async () => {
      appStateHandler!('active');
    });

    expect(mockedLocation.stopGeofencingAsync).toHaveBeenCalledWith(BACKGROUND_GEOFENCE_TASK_NAME);
  });

  it('does not start monitoring if permission is not granted', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];

    await renderHook(() =>
      useBackgroundGeofenceRegistration('group-1', geofences, 'undetermined'),
    );

    await act(async () => {
      appStateHandler!('background');
    });

    expect(mockedLocation.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('does not start monitoring if activeGroupId is null', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];

    await renderHook(() =>
      useBackgroundGeofenceRegistration(null, geofences, 'granted'),
    );

    await act(async () => {
      appStateHandler!('background');
    });

    expect(mockedLocation.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('does not start monitoring if geofences array is empty', async () => {
    await renderHook(() =>
      useBackgroundGeofenceRegistration('group-1', [], 'granted'),
    );

    await act(async () => {
      appStateHandler!('background');
    });

    expect(mockedLocation.startGeofencingAsync).not.toHaveBeenCalled();
  });

  it('selects the first MAX_MONITORED_GEOFENCES geofences sorted by id, not an arbitrary slice', async () => {
    // Create geofences in reverse ID order to test sorting
    const geofences = [
      createGeofence('zone-z', 'Z Zone'),
      createGeofence('zone-y', 'Y Zone'),
      createGeofence('zone-x', 'X Zone'),
      createGeofence('zone-w', 'W Zone'),
      createGeofence('zone-v', 'V Zone'),
      createGeofence('zone-u', 'U Zone'),
      createGeofence('zone-t', 'T Zone'),
      createGeofence('zone-s', 'S Zone'),
      createGeofence('zone-r', 'R Zone'),
      createGeofence('zone-q', 'Q Zone'),
      createGeofence('zone-p', 'P Zone'),
      createGeofence('zone-o', 'O Zone'),
      createGeofence('zone-n', 'N Zone'),
      createGeofence('zone-m', 'M Zone'),
      createGeofence('zone-l', 'L Zone'),
      createGeofence('zone-k', 'K Zone'),
      createGeofence('zone-j', 'J Zone'),
      createGeofence('zone-i', 'I Zone'),
      createGeofence('zone-h', 'H Zone'),
      createGeofence('zone-g', 'G Zone'),
      createGeofence('zone-f', 'F Zone'),
      createGeofence('zone-e', 'E Zone'),
      createGeofence('zone-d', 'D Zone'),
      createGeofence('zone-c', 'C Zone'),
      createGeofence('zone-b', 'B Zone'),
      createGeofence('zone-a', 'A Zone'),
    ];

    await renderHook(() =>
      useBackgroundGeofenceRegistration('group-1', geofences, 'granted'),
    );

    await act(async () => {
      appStateHandler!('background');
    });

    const callArgs = mockedLocation.startGeofencingAsync.mock.calls[0];
    const regions = callArgs[1] as Array<{ identifier: string }>;

    const registeredIds = regions.map(r => r.identifier);

    // Should be a-t (first 20 when sorted)
    const expected = [
      'zone-a',
      'zone-b',
      'zone-c',
      'zone-d',
      'zone-e',
      'zone-f',
      'zone-g',
      'zone-h',
      'zone-i',
      'zone-j',
      'zone-k',
      'zone-l',
      'zone-m',
      'zone-n',
      'zone-o',
      'zone-p',
      'zone-q',
      'zone-r',
      'zone-s',
      'zone-t',
    ];

    expect(registeredIds).toHaveLength(MAX_MONITORED_GEOFENCES);
    expect(registeredIds).toEqual(expected);
  });

  it('unsubscribes from AppState on unmount', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];

    const { unmount } = await renderHook(() =>
      useBackgroundGeofenceRegistration('group-1', geofences, 'granted'),
    );

    expect(appStateSubscription.remove).not.toHaveBeenCalled();

    await unmount();

    expect(appStateSubscription.remove).toHaveBeenCalled();
  });

  it('catches and logs startGeofencingAsync errors', async () => {
    const error = new Error('Geofencing failed');
    mockedLocation.startGeofencingAsync.mockRejectedValue(error);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const geofences = [createGeofence('zone-1', 'Home')];

    await renderHook(() =>
      useBackgroundGeofenceRegistration('group-1', geofences, 'granted'),
    );

    await act(async () => {
      appStateHandler!('background');
    });

    expect(warnSpy).toHaveBeenCalledWith('[geofencing] startGeofencingAsync failed:', error);

    warnSpy.mockRestore();
  });

  it('does not throw when stopping geofencing if monitoring was not running', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];

    mockedLocation.stopGeofencingAsync.mockRejectedValue(new Error('Not running'));

    await renderHook(() =>
      useBackgroundGeofenceRegistration('group-1', geofences, 'granted'),
    );

    await act(async () => {
      appStateHandler!('active');
    });

    // Should not throw
    expect(mockedLocation.stopGeofencingAsync).toHaveBeenCalled();
  });

  it('updates monitoring when geofences change', async () => {
    const { rerender } = await renderHook(
      ({ geofences }: { geofences: Geofence[] }) =>
        useBackgroundGeofenceRegistration('group-1', geofences, 'granted'),
      {
        initialProps: {
          geofences: [createGeofence('zone-1', 'Home')],
        },
      },
    );

    await act(async () => {
      appStateHandler!('background');
    });

    expect(mockedLocation.startGeofencingAsync).toHaveBeenCalledTimes(1);

    await rerender({
      geofences: [
        createGeofence('zone-1', 'Home'),
        createGeofence('zone-2', 'Work'),
      ],
    });

    // Refs are updated but no additional start call from just ref update
    expect(mockedLocation.startGeofencingAsync).toHaveBeenCalledTimes(1);
  });

  it('respects permission status changes via ref', async () => {
    const { rerender } = await renderHook(
      ({ permissionStatus }: { permissionStatus: any }) =>
        useBackgroundGeofenceRegistration('group-1', [createGeofence('zone-1', 'Home')], permissionStatus),
      {
        initialProps: {
          permissionStatus: 'denied' as const,
        },
      },
    );

    await act(async () => {
      appStateHandler!('background');
    });

    expect(mockedLocation.startGeofencingAsync).not.toHaveBeenCalled();

    // Update permission status
    await rerender({
      permissionStatus: 'granted',
    });

    await act(async () => {
      appStateHandler!('background');
    });

    // Now it should start
    expect(mockedLocation.startGeofencingAsync).toHaveBeenCalled();
  });
});
