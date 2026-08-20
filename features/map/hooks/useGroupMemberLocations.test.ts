// features/map/hooks/useGroupMemberLocations.test.ts
import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimePostgresInsertPayload,
} from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { supabase } from '../../../lib/supabase';
import { createOtherUserLocation } from '../../../test/utils';

import { useGroupMemberLocations, type OtherUserLocation } from './useGroupMemberLocations';

jest.mock('../../../lib/supabase');

const mockedFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;
const mockedChannel = supabase.channel as jest.MockedFunction<typeof supabase.channel>;
const mockedRemoveChannel = supabase.removeChannel as jest.MockedFunction<
  typeof supabase.removeChannel
>;

type LocationHistoryRow = {
  user_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  speed_mps: number | null;
  heading_deg: number | null;
};

const mockLocationHistoryQuery = (
  rows: LocationHistoryRow[] = [],
  error: { message: string } | null = null,
) => {
  const query = {
    order: jest.fn().mockResolvedValue({ data: error ? null : rows, error }),
  };
  const inMethod = jest.fn(() => query);
  const select = jest.fn(() => ({ in: inMethod }));

  mockedFrom.mockReturnValue({ select } as unknown as ReturnType<typeof supabase.from>);

  return { select, in: inMethod, order: query.order };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useGroupMemberLocations', () => {
  let capturedChannelCallback: ((payload: RealtimePostgresInsertPayload<LocationHistoryRow>) => void) | null = null;
  let capturedSubscribeCallback: ((status: string) => void) | null = null;
  let mockChannel: any;

  beforeEach(() => {
    capturedChannelCallback = null;
    capturedSubscribeCallback = null;

    // Create a fresh mock channel for each test
    mockChannel = {
      on: jest.fn(),
      subscribe: jest.fn(),
    };

    // Setup channel.on() to capture callbacks and return chainable object
    mockChannel.on.mockImplementation(
      (event: string, filter: unknown, callback: (payload: RealtimePostgresInsertPayload<LocationHistoryRow>) => void) => {
        if (event === 'postgres_changes') {
          capturedChannelCallback = callback;
        }
        return mockChannel; // Return the channel itself for chaining
      },
    );

    // Setup channel.subscribe() to capture status callback
    mockChannel.subscribe.mockImplementation((statusCallback: (status: string) => void) => {
      capturedSubscribeCallback = statusCallback;
      return mockChannel;
    });

    mockedChannel.mockReturnValue(mockChannel);
  });

  it('returns empty locations when memberIds is empty', async () => {
    const { result } = await renderHook(() => useGroupMemberLocations([]));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.locations).toEqual({});
    expect(result.current.errorMessage).toBeNull();
    expect(mockedFrom).not.toHaveBeenCalled();
    expect(mockedChannel).not.toHaveBeenCalled();
  });

  it('fetches latest location per user when memberIds is provided', async () => {
    const rows: LocationHistoryRow[] = [
      {
        user_id: 'member-1',
        latitude: 37.7749,
        longitude: -122.4194,
        recorded_at: '2024-01-01T12:00:00.000Z',
        speed_mps: 1.5,
        heading_deg: 45,
      },
      {
        user_id: 'member-2',
        latitude: 40.7128,
        longitude: -74.006,
        recorded_at: '2024-01-01T11:00:00.000Z',
        speed_mps: 2.5,
        heading_deg: 90,
      },
    ];

    mockLocationHistoryQuery(rows);

    const { result } = await renderHook(() => useGroupMemberLocations(['member-1', 'member-2']));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.locations).toEqual({
      'member-1': createOtherUserLocation(37.7749, -122.4194, '2024-01-01T12:00:00.000Z', 1.5, 45),
      'member-2': createOtherUserLocation(40.7128, -74.006, '2024-01-01T11:00:00.000Z', 2.5, 90),
    });
    expect(result.current.errorMessage).toBeNull();
  });

  it('reduces multiple rows to latest per user by recorded_at', async () => {
    const rows: LocationHistoryRow[] = [
      {
        user_id: 'member-1',
        latitude: 37.7749,
        longitude: -122.4194,
        recorded_at: '2024-01-01T12:00:00.000Z',
        speed_mps: 1.5,
        heading_deg: 45,
      },
      {
        user_id: 'member-1',
        latitude: 37.774,
        longitude: -122.419,
        recorded_at: '2024-01-01T11:00:00.000Z', // older, should be ignored
        speed_mps: 1.0,
        heading_deg: 40,
      },
    ];

    mockLocationHistoryQuery(rows);

    const { result } = await renderHook(() => useGroupMemberLocations(['member-1']));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.locations['member-1']).toEqual(
      createOtherUserLocation(37.7749, -122.4194, '2024-01-01T12:00:00.000Z', 1.5, 45),
    );
  });

  it('updates location state when realtime INSERT arrives for a subscribed member', async () => {
    const initialRows: LocationHistoryRow[] = [
      {
        user_id: 'member-1',
        latitude: 37.7749,
        longitude: -122.4194,
        recorded_at: '2024-01-01T12:00:00.000Z',
        speed_mps: 1.5,
        heading_deg: 45,
      },
    ];

    mockLocationHistoryQuery(initialRows);

    const { result } = await renderHook(() => useGroupMemberLocations(['member-1', 'member-2']));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.locations['member-1']).toBeDefined();

    // Simulate realtime INSERT for member-2
    const newLocation: LocationHistoryRow = {
      user_id: 'member-2',
      latitude: 40.7128,
      longitude: -74.006,
      recorded_at: '2024-01-01T13:00:00.000Z',
      speed_mps: 2.5,
      heading_deg: 90,
    };

    await act(async () => {
      capturedChannelCallback?.({
        eventType: 'INSERT',
        new: newLocation,
        old: null,
        schema: 'public',
        table: 'location_history',
      } as unknown as RealtimePostgresInsertPayload<LocationHistoryRow>);
    });

    expect(result.current.locations['member-2']).toEqual(
      createOtherUserLocation(40.7128, -74.006, '2024-01-01T13:00:00.000Z', 2.5, 90),
    );
  });

  it('ignores realtime INSERT for member not in memberIds (RLS safety)', async () => {
    const initialRows: LocationHistoryRow[] = [
      {
        user_id: 'member-1',
        latitude: 37.7749,
        longitude: -122.4194,
        recorded_at: '2024-01-01T12:00:00.000Z',
        speed_mps: 1.5,
        heading_deg: 45,
      },
    ];

    mockLocationHistoryQuery(initialRows);

    const { result } = await renderHook(() => useGroupMemberLocations(['member-1']));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Simulate realtime INSERT for member-2 (not in subscribed memberIds)
    const unauthorizedLocation: LocationHistoryRow = {
      user_id: 'member-2',
      latitude: 40.7128,
      longitude: -74.006,
      recorded_at: '2024-01-01T13:00:00.000Z',
      speed_mps: 2.5,
      heading_deg: 90,
    };

    await act(async () => {
      capturedChannelCallback?.({
        eventType: 'INSERT',
        new: unauthorizedLocation,
        old: null,
        schema: 'public',
        table: 'location_history',
      } as unknown as RealtimePostgresInsertPayload<LocationHistoryRow>);
    });

    expect(result.current.locations['member-2']).toBeUndefined();
  });

  it('refetches on SUBSCRIBED status', async () => {
    mockLocationHistoryQuery([
      {
        user_id: 'member-1',
        latitude: 37.7749,
        longitude: -122.4194,
        recorded_at: '2024-01-01T12:00:00.000Z',
        speed_mps: 1.5,
        heading_deg: 45,
      },
    ]);

    await renderHook(() => useGroupMemberLocations(['member-1']));

    await waitFor(() => {
      expect(capturedSubscribeCallback).toBeDefined();
    });

    // SUBSCRIBED status triggers a refetch
    mockLocationHistoryQuery([
      {
        user_id: 'member-1',
        latitude: 37.8,
        longitude: -122.42,
        recorded_at: '2024-01-01T13:00:00.000Z',
        speed_mps: 2.0,
        heading_deg: 50,
      },
    ]);

    await act(async () => {
      capturedSubscribeCallback?.(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    });

    await waitFor(() => {
      expect(mockedFrom).toHaveBeenCalled();
    });
  });

  it('resets and resubscribes when memberIds changes', async () => {
    const rows1: LocationHistoryRow[] = [
      {
        user_id: 'member-1',
        latitude: 37.7749,
        longitude: -122.4194,
        recorded_at: '2024-01-01T12:00:00.000Z',
        speed_mps: 1.5,
        heading_deg: 45,
      },
    ];

    mockLocationHistoryQuery(rows1);

    const { rerender } = await renderHook(
      ({ ids }: { ids: string[] }) => useGroupMemberLocations(ids),
      { initialProps: { ids: ['member-1'] } },
    );

    await waitFor(() => {
      expect(mockedFrom).toHaveBeenCalled();
    });

    const callCount1 = mockedFrom.mock.calls.length;

    // Change to different memberIds
    const rows2: LocationHistoryRow[] = [
      {
        user_id: 'member-2',
        latitude: 40.7128,
        longitude: -74.006,
        recorded_at: '2024-01-01T12:00:00.000Z',
        speed_mps: 2.5,
        heading_deg: 90,
      },
    ];

    mockLocationHistoryQuery(rows2);
    rerender({ ids: ['member-2'] });

    await waitFor(() => {
      expect(mockedFrom.mock.calls.length).toBeGreaterThan(callCount1);
    });

    expect(mockedRemoveChannel).toHaveBeenCalled();
  });

  it('cleans up the realtime channel subscription on unmount', async () => {
    mockLocationHistoryQuery([
      {
        user_id: 'member-1',
        latitude: 37.7749,
        longitude: -122.4194,
        recorded_at: '2024-01-01T12:00:00.000Z',
        speed_mps: 1.5,
        heading_deg: 45,
      },
    ]);

    const { unmount } = await renderHook(() => useGroupMemberLocations(['member-1']));

    await waitFor(() => {
      expect(mockedChannel).toHaveBeenCalled();
    });

    await act(async () => {
      unmount();
    });

    expect(mockedRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('handles query errors gracefully', async () => {
    const error = { message: 'database connection failed' };
    mockLocationHistoryQuery([], error);

    const { result } = await renderHook(() => useGroupMemberLocations(['member-1']));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBe('database connection failed');
    expect(result.current.locations).toEqual({});
  });

  it('ignores realtime events after cleanup (effect cancellation)', async () => {
    mockLocationHistoryQuery([
      {
        user_id: 'member-1',
        latitude: 37.7749,
        longitude: -122.4194,
        recorded_at: '2024-01-01T12:00:00.000Z',
        speed_mps: 1.5,
        heading_deg: 45,
      },
    ]);

    const { unmount } = await renderHook(() => useGroupMemberLocations(['member-1', 'member-2']));

    await waitFor(() => {
      expect(capturedChannelCallback).toBeDefined();
    });

    unmount();

    // Simulate event arriving after unmount — should be ignored by isCancelled check
    await act(async () => {
      capturedChannelCallback?.({
        eventType: 'INSERT',
        new: {
          user_id: 'member-2',
          latitude: 40.7128,
          longitude: -74.006,
          recorded_at: '2024-01-01T13:00:00.000Z',
          speed_mps: 2.5,
          heading_deg: 90,
        } as LocationHistoryRow,
        old: null,
        schema: 'public',
        table: 'location_history',
      } as unknown as RealtimePostgresInsertPayload<LocationHistoryRow>);
    });

    // No error should be thrown
  });
});
