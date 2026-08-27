// features/geofencing/backgroundGeofenceTask.test.ts
jest.mock('../../lib/supabase');
jest.mock('./lib/logGeofenceEvent');
jest.mock('expo-task-manager');

import { GeofencingEventType, type LocationRegion } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { supabase } from '../../lib/supabase';
import { logGeofenceEvent } from './lib/logGeofenceEvent';
import { BACKGROUND_GEOFENCE_TASK_NAME } from '../../lib/constants';

const mockedSupabase = supabase as jest.Mocked<typeof supabase>;
const mockedLogGeofenceEvent = logGeofenceEvent as jest.MockedFunction<typeof logGeofenceEvent>;
const mockedTaskManager = TaskManager as jest.Mocked<typeof TaskManager>;

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
});
