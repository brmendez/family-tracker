// features/geofencing/hooks/useBackgroundGeofenceRegistration.test.ts
import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { BACKGROUND_GEOFENCE_TASK_NAME, MAX_MONITORED_GEOFENCES } from '../../../lib/constants';
import * as tracker from '../lib/geofenceRegistrationTracker';
import type { Geofence } from '../types/geofence.types';
import type { BackgroundGeofencePermissionState } from './useBackgroundGeofencePermission';
import { useBackgroundGeofenceRegistration } from './useBackgroundGeofenceRegistration';

jest.mock('expo-location');
jest.mock('../lib/geofenceRegistrationTracker');

const mockedLocation = Location as jest.Mocked<typeof Location>;
const mockedTracker = tracker as jest.Mocked<typeof tracker>;

function createGeofence(id: string, name: string, lat = 37.7749, lng = -122.4194, radiusM = 100): Geofence {
  return {
    id,
    groupId: 'group-1',
    name,
    latitude: lat,
    longitude: lng,
    radiusM,
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

type RegistrationProps = {
  activeGroupId: string | null;
  geofences: Geofence[];
  permissionStatus: BackgroundGeofencePermissionState;
};

describe('useBackgroundGeofenceRegistration (FT-34)', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockedLocation.startGeofencingAsync.mockResolvedValue(undefined);
    mockedLocation.stopGeofencingAsync.mockResolvedValue(undefined);
    mockedTracker.recordGeofenceRegistration.mockImplementation(() => {});
    mockedTracker.getLastRegisteredSignature.mockReturnValue(null);
    mockedTracker.clearGeofenceRegistration.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('registration on ready state', () => {
    it('registers when permission is granted, activeGroupId exists, and geofences are present', async () => {
      const geofences = [createGeofence('zone-1', 'Home')];

      await act(async () => {
        renderHook(() => useBackgroundGeofenceRegistration('group-1', geofences, 'granted'));
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

    it('records the registration signature after successful start', async () => {
      const geofences = [createGeofence('zone-1', 'Home')];

      await act(async () => {
        renderHook(() => useBackgroundGeofenceRegistration('group-1', geofences, 'granted'));
      });

      expect(mockedTracker.recordGeofenceRegistration).toHaveBeenCalledWith(
        'zone-1:37.7749:-122.4194:100',
      );
    });

    it('sorts geofences by id for stable signature', async () => {
      const geofences = [
        createGeofence('zone-z', 'Z Zone'),
        createGeofence('zone-a', 'A Zone'),
        createGeofence('zone-m', 'M Zone'),
      ];

      mockedTracker.getLastRegisteredSignature.mockReturnValue(null);
      await act(async () => {
        renderHook(() => useBackgroundGeofenceRegistration('group-1', geofences, 'granted'));
      });

      const callArgs = mockedLocation.startGeofencingAsync.mock.calls[0][1];
      const ids = (callArgs as any[]).map((r: any) => r.identifier);

      expect(ids).toEqual(['zone-a', 'zone-m', 'zone-z']);
    });

    it('caps geofences at MAX_MONITORED_GEOFENCES', async () => {
      const geofences = Array.from({ length: MAX_MONITORED_GEOFENCES + 5 }, (_, i) =>
        createGeofence(`zone-${String(i).padStart(2, '0')}`, `Zone ${i}`),
      );

      await act(async () => {
        renderHook(() => useBackgroundGeofenceRegistration('group-1', geofences, 'granted'));
      });

      const callArgs = mockedLocation.startGeofencingAsync.mock.calls[0][1];
      expect((callArgs as any[]).length).toBe(MAX_MONITORED_GEOFENCES);
    });
  });

  describe('skipping re-registration when signature unchanged', () => {
    it('does not call startGeofencingAsync when signature matches the last registered one', async () => {
      const geofences = [createGeofence('zone-1', 'Home')];
      const signature = 'zone-1:37.7749:-122.4194:100';

      mockedTracker.getLastRegisteredSignature.mockReturnValue(signature);

      await act(async () => {
        renderHook(() => useBackgroundGeofenceRegistration('group-1', geofences, 'granted'));
      });

      expect(mockedLocation.startGeofencingAsync).not.toHaveBeenCalled();
    });
  });

  describe('re-registration on changed state', () => {
    it('re-registers when geofences change and signature differs', async () => {
      mockedTracker.getLastRegisteredSignature.mockReturnValue(null);

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences: [createGeofence('zone-1', 'Home')],
            permissionStatus: 'granted' as const,
          },
        },
      );

      mockedLocation.startGeofencingAsync.mockClear();

      await act(async () => {
        rerender({
          activeGroupId: 'group-1',
          geofences: [
            createGeofence('zone-1', 'Home'),
            createGeofence('zone-2', 'Work'),
          ],
          permissionStatus: 'granted',
        });
      });

      expect(mockedLocation.startGeofencingAsync).toHaveBeenCalled();
    });

    it('re-registers when permission changes from denied to granted', async () => {
      mockedTracker.getLastRegisteredSignature.mockReturnValue(null);

      const geofences = [createGeofence('zone-1', 'Home')];

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences,
            permissionStatus: 'denied' as const,
          },
        },
      );

      mockedLocation.startGeofencingAsync.mockClear();

      await act(async () => {
        rerender({
          activeGroupId: 'group-1',
          geofences,
          permissionStatus: 'granted',
        });
      });

      expect(mockedLocation.startGeofencingAsync).toHaveBeenCalled();
    });

    it('re-registers when activeGroupId changes', async () => {
      mockedTracker.getLastRegisteredSignature.mockReturnValue(null);

      const geofences = [createGeofence('zone-1', 'Home')];

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences,
            permissionStatus: 'granted' as const,
          },
        },
      );

      mockedLocation.startGeofencingAsync.mockClear();

      await act(async () => {
        rerender({
          activeGroupId: 'group-2',
          geofences,
          permissionStatus: 'granted',
        });
      });

      expect(mockedLocation.startGeofencingAsync).toHaveBeenCalled();
    });
  });

  describe('stopping and clearing on zero-state transitions', () => {
    it('stops and clears when permission changes from granted to denied', async () => {
      const geofences = [createGeofence('zone-1', 'Home')];

      mockedTracker.getLastRegisteredSignature.mockReturnValue('zone-1:37.7749:-122.4194:100');

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences,
            permissionStatus: 'granted' as const,
          },
        },
      );

      await act(async () => {
        rerender({
          activeGroupId: 'group-1',
          geofences,
          permissionStatus: 'denied',
        });
      });

      expect(mockedLocation.stopGeofencingAsync).toHaveBeenCalledWith(BACKGROUND_GEOFENCE_TASK_NAME);
      expect(mockedTracker.clearGeofenceRegistration).toHaveBeenCalled();
    });

    it('stops and clears when activeGroupId becomes null', async () => {
      const geofences = [createGeofence('zone-1', 'Home')];

      mockedTracker.getLastRegisteredSignature.mockReturnValue('zone-1:37.7749:-122.4194:100');

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences,
            permissionStatus: 'granted' as const,
          },
        },
      );

      await act(async () => {
        rerender({
          activeGroupId: null,
          geofences,
          permissionStatus: 'granted',
        });
      });

      expect(mockedLocation.stopGeofencingAsync).toHaveBeenCalledWith(BACKGROUND_GEOFENCE_TASK_NAME);
      expect(mockedTracker.clearGeofenceRegistration).toHaveBeenCalled();
    });

    it('stops and clears when geofences become empty', async () => {
      mockedTracker.getLastRegisteredSignature.mockReturnValue('zone-1:37.7749:-122.4194:100');

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences: [createGeofence('zone-1', 'Home')],
            permissionStatus: 'granted' as const,
          },
        },
      );

      await act(async () => {
        rerender({
          activeGroupId: 'group-1',
          geofences: [],
          permissionStatus: 'granted',
        });
      });

      expect(mockedLocation.stopGeofencingAsync).toHaveBeenCalledWith(BACKGROUND_GEOFENCE_TASK_NAME);
      expect(mockedTracker.clearGeofenceRegistration).toHaveBeenCalled();
    });

    it('does not stop if already in zero state (signature is null)', async () => {
      const geofences = [createGeofence('zone-1', 'Home')];

      mockedTracker.getLastRegisteredSignature.mockReturnValue(null);

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences,
            permissionStatus: 'granted' as const,
          },
        },
      );

      mockedLocation.stopGeofencingAsync.mockClear();

      await act(async () => {
        rerender({
          activeGroupId: 'group-1',
          geofences: [],
          permissionStatus: 'granted',
        });
      });

      expect(mockedLocation.stopGeofencingAsync).not.toHaveBeenCalled();
    });
  });

  describe('no repeated stop calls on re-renders in zero state', () => {
    it('does not call stopGeofencingAsync repeatedly when re-rendering with no permission', async () => {
      const geofences = [createGeofence('zone-1', 'Home')];

      mockedTracker.getLastRegisteredSignature.mockReturnValue(null);

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences,
            permissionStatus: 'denied' as const,
          },
        },
      );

      mockedLocation.stopGeofencingAsync.mockClear();

      // Re-render multiple times with the same denied state
      await act(async () => {
        rerender({
          activeGroupId: 'group-1',
          geofences,
          permissionStatus: 'denied',
        });
        rerender({
          activeGroupId: 'group-1',
          geofences,
          permissionStatus: 'denied',
        });
        rerender({
          activeGroupId: 'group-1',
          geofences,
          permissionStatus: 'denied',
        });
      });

      expect(mockedLocation.stopGeofencingAsync).not.toHaveBeenCalled();
    });

    it('does not call stopGeofencingAsync repeatedly when re-rendering with empty geofences', async () => {
      mockedTracker.getLastRegisteredSignature.mockReturnValue(null);

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences: [],
            permissionStatus: 'granted' as const,
          },
        },
      );

      mockedLocation.stopGeofencingAsync.mockClear();

      // Re-render multiple times with empty geofences
      await act(async () => {
        rerender({
          activeGroupId: 'group-1',
          geofences: [],
          permissionStatus: 'granted',
        });
        rerender({
          activeGroupId: 'group-1',
          geofences: [],
          permissionStatus: 'granted',
        });
      });

      expect(mockedLocation.stopGeofencingAsync).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('catches and logs startGeofencingAsync errors', async () => {
      const error = new Error('Geofencing failed');
      mockedLocation.startGeofencingAsync.mockRejectedValueOnce(error);

      const geofences = [createGeofence('zone-1', 'Home')];

      await act(async () => {
        renderHook(() => useBackgroundGeofenceRegistration('group-1', geofences, 'granted'));
      });

      // Give the promise time to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(consoleWarnSpy).toHaveBeenCalledWith('[geofencing] startGeofencingAsync failed:', error);
    });

    it('catches and logs stopGeofencingAsync errors', async () => {
      const error = new Error('Stop failed');
      mockedLocation.stopGeofencingAsync.mockRejectedValueOnce(error);

      mockedTracker.getLastRegisteredSignature.mockReturnValue('zone-1:37.7749:-122.4194:100');

      const geofences = [createGeofence('zone-1', 'Home')];

      const { rerender } = await renderHook(
        (props: RegistrationProps) =>
          useBackgroundGeofenceRegistration(props.activeGroupId, props.geofences, props.permissionStatus),
        {
          initialProps: {
            activeGroupId: 'group-1',
            geofences,
            permissionStatus: 'granted' as const,
          },
        },
      );

      await act(async () => {
        rerender({
          activeGroupId: 'group-1',
          geofences,
          permissionStatus: 'denied',
        });
      });

      // Give the promise time to settle
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(consoleWarnSpy).toHaveBeenCalledWith('[geofencing] stopGeofencingAsync failed:', error);
    });
  });
});
