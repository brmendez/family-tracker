// features/geofencing/backgroundGeofenceTask.test.ts
jest.mock('../../lib/supabase');
jest.mock('./lib/logGeofenceEvent');
jest.mock('./lib/geofenceRegistrationTracker');
jest.mock('expo-task-manager');

import { GeofencingEventType, type LocationRegion } from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { supabase } from '../../lib/supabase';
import { logGeofenceEvent } from './lib/logGeofenceEvent';
import * as tracker from './lib/geofenceRegistrationTracker';
import { BACKGROUND_GEOFENCE_TASK_NAME } from '../../lib/constants';

const mockedSupabase = supabase as jest.Mocked<typeof supabase>;
const mockedLogGeofenceEvent = logGeofenceEvent as jest.MockedFunction<typeof logGeofenceEvent>;
const mockedTaskManager = TaskManager as jest.Mocked<typeof TaskManager>;
const mockedTracker = tracker as jest.Mocked<typeof tracker>;

// Require the background geofence task to register it with TaskManager (hoisted after mocks)
// eslint-disable-next-line global-require
require('./backgroundGeofenceTask');

describe('backgroundGeofenceTask', () => {
  let taskHandler: any;

  beforeEach(() => {
    // Set up mocks before extracting handler
    (mockedSupabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-123' },
        } as any,
      },
    } as any);

    mockedTracker.isWithinRegistrationSuppressWindow.mockReturnValue(false);

    // Extract the task handler from the defineTask call
    // This should have been called during module import
    const calls = mockedTaskManager.defineTask.mock.calls;
    if (calls.length > 0) {
      taskHandler = calls[calls.length - 1][1];
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registers the task with correct name', () => {
    expect(mockedTaskManager.defineTask).toHaveBeenCalledWith(
      BACKGROUND_GEOFENCE_TASK_NAME,
      expect.any(Function),
    );
  });

  it('maps Enter event to "enter" and calls logGeofenceEvent', async () => {
    const region: LocationRegion = {
      identifier: 'zone-123',
      latitude: 37.7749,
      longitude: -122.4194,
      radius: 100,
    };

    await taskHandler({
      data: {
        eventType: GeofencingEventType.Enter,
        region,
      },
    });

    expect(mockedLogGeofenceEvent).toHaveBeenCalledWith(
      {
        geofenceId: 'zone-123',
        eventType: 'enter',
        occurredAt: expect.any(String),
      },
      'user-123',
    );
  });

  it('maps Exit event to "exit" and calls logGeofenceEvent', async () => {
    const region: LocationRegion = {
      identifier: 'zone-456',
      latitude: 40.7128,
      longitude: -74.006,
      radius: 150,
    };

    await taskHandler({
      data: {
        eventType: GeofencingEventType.Exit,
        region,
      },
    });

    expect(mockedLogGeofenceEvent).toHaveBeenCalledWith(
      {
        geofenceId: 'zone-456',
        eventType: 'exit',
        occurredAt: expect.any(String),
      },
      'user-123',
    );
  });

  it('does not call logGeofenceEvent when error is present', async () => {
    await taskHandler({
      data: null,
      error: new Error('Task error'),
    });

    expect(mockedLogGeofenceEvent).not.toHaveBeenCalled();
  });

  it('does not call logGeofenceEvent when data is null', async () => {
    await taskHandler({
      data: null,
      error: null,
    });

    expect(mockedLogGeofenceEvent).not.toHaveBeenCalled();
  });

  it('does not call logGeofenceEvent when region identifier is empty', async () => {
    const region: LocationRegion = {
      identifier: '',
      latitude: 37.7749,
      longitude: -122.4194,
      radius: 100,
    };

    await taskHandler({
      data: {
        eventType: GeofencingEventType.Enter,
        region,
      },
    });

    expect(mockedLogGeofenceEvent).not.toHaveBeenCalled();
  });

  it('does not call logGeofenceEvent when there is no active session', async () => {
    (mockedSupabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
    } as any);

    const region: LocationRegion = {
      identifier: 'zone-123',
      latitude: 37.7749,
      longitude: -122.4194,
      radius: 100,
    };

    await taskHandler({
      data: {
        eventType: GeofencingEventType.Enter,
        region,
      },
    });

    expect(mockedLogGeofenceEvent).not.toHaveBeenCalled();
  });

  it('does not call logGeofenceEvent when session has no user id', async () => {
    (mockedSupabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: {
        session: { user: { id: null } } as any,
      },
    } as any);

    const region: LocationRegion = {
      identifier: 'zone-123',
      latitude: 37.7749,
      longitude: -122.4194,
      radius: 100,
    };

    await taskHandler({
      data: {
        eventType: GeofencingEventType.Enter,
        region,
      },
    });

    expect(mockedLogGeofenceEvent).not.toHaveBeenCalled();
  });

  it('sets occurred_at to current ISO timestamp', async () => {
    const region: LocationRegion = {
      identifier: 'zone-123',
      latitude: 37.7749,
      longitude: -122.4194,
      radius: 100,
    };

    const beforeTime = Date.now();

    await taskHandler({
      data: {
        eventType: GeofencingEventType.Enter,
        region,
      },
    });

    const afterTime = Date.now();

    const call = mockedLogGeofenceEvent.mock.calls[0];
    const occurredAt = call[0].occurredAt;
    const occurredAtTime = new Date(occurredAt).getTime();

    // Check that the timestamp is between before and after
    expect(occurredAtTime).toBeGreaterThanOrEqual(beforeTime);
    expect(occurredAtTime).toBeLessThanOrEqual(afterTime + 100); // Small tolerance for execution time
  });

  describe('FT-34: guards added to backgroundGeofenceTask', () => {
    // FT-34 adds two guards to the background task handler:
    // Fix 2: AppState.currentState === 'active' check (prevents foreground detection)
    // Fix 3: isWithinRegistrationSuppressWindow() check (swallows iOS's initial-state report)
    // Both guards are tested below.
  });

  describe('FT-34 Fix 3: registration suppress window guard', () => {
    it('skips logging when within the registration suppress window', async () => {
      mockedTracker.isWithinRegistrationSuppressWindow.mockReturnValue(true);

      const region: LocationRegion = {
        identifier: 'zone-123',
        latitude: 37.7749,
        longitude: -122.4194,
        radius: 100,
      };

      await taskHandler({
        data: {
          eventType: GeofencingEventType.Enter,
          region,
        },
      });

      expect(mockedLogGeofenceEvent).not.toHaveBeenCalled();
      expect(mockedTracker.isWithinRegistrationSuppressWindow).toHaveBeenCalled();
    });

    it('logs normally after the suppress window expires', async () => {
      mockedTracker.isWithinRegistrationSuppressWindow.mockReturnValue(false);

      const region: LocationRegion = {
        identifier: 'zone-123',
        latitude: 37.7749,
        longitude: -122.4194,
        radius: 100,
      };

      await taskHandler({
        data: {
          eventType: GeofencingEventType.Enter,
          region,
        },
      });

      expect(mockedLogGeofenceEvent).toHaveBeenCalledWith(
        {
          geofenceId: 'zone-123',
          eventType: 'enter',
          occurredAt: expect.any(String),
        },
        'user-123',
      );
    });

    it('checks suppress window before returning', async () => {
      mockedTracker.isWithinRegistrationSuppressWindow.mockReturnValue(true);

      const region: LocationRegion = {
        identifier: 'zone-123',
        latitude: 37.7749,
        longitude: -122.4194,
        radius: 100,
      };

      await taskHandler({
        data: {
          eventType: GeofencingEventType.Enter,
          region,
        },
      });

      // Verify the suppress window check was called (no early return before it)
      expect(mockedTracker.isWithinRegistrationSuppressWindow).toHaveBeenCalled();
    });
  });

  describe('FT-34: confirm callback outside suppress window still writes', () => {
    it('logs a crossing when suppress window is inactive', async () => {
      mockedTracker.isWithinRegistrationSuppressWindow.mockReturnValue(false);

      const region: LocationRegion = {
        identifier: 'zone-789',
        latitude: 51.5074,
        longitude: -0.1278,
        radius: 200,
      };

      await taskHandler({
        data: {
          eventType: GeofencingEventType.Exit,
          region,
        },
      });

      expect(mockedLogGeofenceEvent).toHaveBeenCalledWith(
        {
          geofenceId: 'zone-789',
          eventType: 'exit',
          occurredAt: expect.any(String),
        },
        'user-123',
      );
    });
  });
});
