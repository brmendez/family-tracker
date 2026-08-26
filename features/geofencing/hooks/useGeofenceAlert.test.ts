// features/geofencing/hooks/useGeofenceAlert.test.ts
import { renderHook, act, waitFor } from '@testing-library/react-native';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';

import { GEOFENCE_ALERT_AUTO_DISMISS_MS } from '../../../lib/constants';
import { supabase } from '../../../lib/supabase';
import { flush } from '../../../test/utils';
import type { ActiveGroupMember } from '../../map/hooks/useActiveGroupMembers';
import type { Geofence } from '../types/geofence.types';
import { useGeofenceAlert } from './useGeofenceAlert';

jest.mock('../../../lib/supabase');

const mockedSupabase = supabase as jest.Mocked<typeof supabase>;

type GeofenceEventRow = {
  geofence_id: string;
  user_id: string;
  event_type: 'enter' | 'exit';
  occurred_at: string;
};

function createGeofence(id: string, name: string): Geofence {
  return {
    id,
    groupId: 'group-1',
    name,
    latitude: 37.7749,
    longitude: -122.4194,
    radiusM: 100,
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

function createMember(id: string, displayName: string): ActiveGroupMember {
  return {
    id,
    displayName,
    avatarColor: '#ff0000',
  };
}

function createPayload(
  geofenceId: string,
  userId: string,
  eventType: 'enter' | 'exit' = 'enter',
  occurredAt: string = '2024-01-01T12:00:00.000Z',
): RealtimePostgresInsertPayload<GeofenceEventRow> {
  return {
    new: {
      geofence_id: geofenceId,
      user_id: userId,
      event_type: eventType,
      occurred_at: occurredAt,
    },
  } as RealtimePostgresInsertPayload<GeofenceEventRow>;
}

describe('useGeofenceAlert', () => {
  // Store mock channel globally so we can access the captured handler
  let currentMockChannel: any;

  function getCapturedHandler() {
    return currentMockChannel._capturedHandler;
  }

  beforeEach(() => {
    // Clear and reset ALL mocks completely BEFORE setting up
    jest.clearAllMocks();

    // Create fresh mock for this test ONLY - store handler ON the mock object
    currentMockChannel = {
      _capturedHandler: undefined as any,
      on: jest.fn(function (event: string, config: any, handler: any) {
        if (event === 'postgres_changes') {
          this._capturedHandler = handler;
        }
        return this;
      }),
      subscribe: jest.fn(function () {
        return {};
      }),
    };

    // Re-setup mocks from scratch
    mockedSupabase.channel.mockReturnValue(currentMockChannel);
    mockedSupabase.removeChannel.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    // Ensure fake timers don't bleed into next test
    jest.useRealTimers();

    // Flush all microtasks to ensure cleanup completes
    await flush();

    // Clear reference
    currentMockChannel = null;
  });

  it('returns null alert initially', async () => {
    const { result } = await renderHook(() =>
      useGeofenceAlert('group-1', [], [], 'current-user-id'),
    );

    expect(result.current.visibleAlert).toBeNull();
    expect(typeof result.current.dismiss).toBe('function');
  });

  it('filters self-write (own user crossing)', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];
    const members = [createMember('current-user-id', 'Me')];

    const { result } = await renderHook(() =>
      useGeofenceAlert('group-1', geofences, members, 'current-user-id'),
    );

    // Ensure refs are populated by flushing microtasks
    await flush();

    await act(async () => {
      getCapturedHandler()?.(createPayload('zone-1', 'current-user-id', 'enter'));
    });

    expect(result.current.visibleAlert).toBeNull();
  });

  it('filters unknown geofence (not in active group)', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];
    const members = [createMember('user-2', 'Alice')];

    const { result } = await renderHook(() =>
      useGeofenceAlert('group-1', geofences, members, 'current-user-id'),
    );

    // Ensure refs are populated by flushing microtasks
    await flush();

    await act(async () => {
      getCapturedHandler()?.(createPayload('zone-999', 'user-2', 'enter'));
    });

    expect(result.current.visibleAlert).toBeNull();
  });

  it('filters unknown member (not in members list)', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];
    const members = [createMember('user-2', 'Alice')];

    const { result } = await renderHook(() =>
      useGeofenceAlert('group-1', geofences, members, 'current-user-id'),
    );

    // Ensure refs are populated by flushing microtasks
    await flush();

    await act(async () => {
      getCapturedHandler()?.(createPayload('zone-1', 'user-999', 'enter'));
    });

    expect(result.current.visibleAlert).toBeNull();
  });

  it('shows alert for valid other-member crossing', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];
    const members = [createMember('user-2', 'Alice')];

    const { result } = await renderHook(() =>
      useGeofenceAlert('group-1', geofences, members, 'current-user-id'),
    );

    // Ensure refs are populated by flushing microtasks
    await flush();

    await act(async () => {
      getCapturedHandler()?.(createPayload('zone-1', 'user-2', 'enter', '2024-01-01T12:00:00.000Z'));
    });

    expect(result.current.visibleAlert).toMatchObject({
      geofenceId: 'zone-1',
      geofenceName: 'Home',
      eventType: 'enter',
      userId: 'user-2',
      displayName: 'Alice',
      occurredAt: '2024-01-01T12:00:00.000Z',
    });
  });

  it('auto-dismisses alert after timeout', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];
    const members = [createMember('user-2', 'Alice')];

    // Fake timers must be active before the event fires, since that's what
    // schedules the auto-dismiss setTimeout — enabling them afterward can't
    // control a timer that was already scheduled on the real clock.
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() =>
        useGeofenceAlert('group-1', geofences, members, 'current-user-id'),
      );
      await flush();

      await act(async () => {
        getCapturedHandler()?.(createPayload('zone-1', 'user-2', 'enter'));
      });

      expect(result.current.visibleAlert).not.toBeNull();

      await act(() => {
        jest.advanceTimersByTime(GEOFENCE_ALERT_AUTO_DISMISS_MS);
      });

      expect(result.current.visibleAlert).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('manual dismiss cancels auto-dismiss timer', async () => {
    const geofences = [createGeofence('zone-1', 'Home')];
    const members = [createMember('user-2', 'Alice')];

    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() =>
        useGeofenceAlert('group-1', geofences, members, 'current-user-id'),
      );
      await flush();

      await act(async () => {
        getCapturedHandler()?.(createPayload('zone-1', 'user-2', 'enter'));
      });

      expect(result.current.visibleAlert).not.toBeNull();

      await act(() => {
        result.current.dismiss();
      });

      expect(result.current.visibleAlert).toBeNull();

      await act(() => {
        jest.advanceTimersByTime(GEOFENCE_ALERT_AUTO_DISMISS_MS);
      });

      expect(result.current.visibleAlert).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('replaces alert and restarts timer on new event', async () => {
    const geofences = [
      createGeofence('zone-1', 'Home'),
      createGeofence('zone-2', 'Work'),
    ];
    const members = [createMember('user-2', 'Alice'), createMember('user-3', 'Bob')];

    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() =>
        useGeofenceAlert('group-1', geofences, members, 'current-user-id'),
      );
      await flush();

      // First event
      await act(async () => {
        getCapturedHandler()?.(createPayload('zone-1', 'user-2', 'enter', '2024-01-01T12:00:00.000Z'));
      });

      expect(result.current.visibleAlert?.displayName).toBe('Alice');

      // Advance partway through auto-dismiss
      await act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Second event arrives
      await act(async () => {
        getCapturedHandler()?.(createPayload('zone-2', 'user-3', 'enter', '2024-01-01T12:00:01.000Z'));
      });

      expect(result.current.visibleAlert?.displayName).toBe('Bob');

      // Advance another 3 seconds (6 total from first event, but only 3 from second)
      await act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Alert should still be visible (timer was restarted)
      expect(result.current.visibleAlert).not.toBeNull();

      // Advance to complete the second event's timer
      await act(() => {
        jest.advanceTimersByTime(GEOFENCE_ALERT_AUTO_DISMISS_MS);
      });

      expect(result.current.visibleAlert).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
