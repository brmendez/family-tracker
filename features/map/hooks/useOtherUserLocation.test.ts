// features/map/hooks/useOtherUserLocation.test.ts
import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimePostgresInsertPayload,
} from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { supabase } from '../../../lib/supabase';
import { useOtherUserLocation } from './useOtherUserLocation';

jest.mock('../../../lib/supabase');

const mockSupabaseFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;
const mockSupabaseChannel = supabase.channel as jest.MockedFunction<typeof supabase.channel>;
const mockSupabaseRemoveChannel = supabase.removeChannel as jest.MockedFunction<
  typeof supabase.removeChannel
>;

type LocationHistoryRow = {
  latitude: number;
  longitude: number;
  recorded_at: string;
  speed_mps: number | null;
  heading_deg: number | null;
};

const createMockSelectChain = (
  data: LocationHistoryRow[] = [],
  error: { message: string } | null = null,
) => {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  };
};

const createMockLocationRow = (
  latitude: number = 37.7749,
  longitude: number = -122.4194,
  recordedAt: string = '2024-01-01T00:00:00.000Z',
  speedMps: number | null = 1.5,
  headingDeg: number | null = 45,
): LocationHistoryRow => ({
  latitude,
  longitude,
  recorded_at: recordedAt,
  speed_mps: speedMps,
  heading_deg: headingDeg,
});

describe('useOtherUserLocation', () => {
  let capturedChannelCallback: ((payload: RealtimePostgresInsertPayload<LocationHistoryRow>) => void) | null =
    null;
  let capturedSubscribeCallback: ((status: string) => void) | null = null;
  let mockChannel: any;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedChannelCallback = null;
    capturedSubscribeCallback = null;

    // Create a fresh mock channel for each test
    mockChannel = {
      on: jest.fn(),
      subscribe: jest.fn(),
    };

    // Setup the channel.on() to capture callbacks and return chainable object
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

    mockSupabaseChannel.mockReturnValue(mockChannel);
  });

  it('no-ops when otherUserId is null', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherUserLocation(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockSupabaseFrom).not.toHaveBeenCalled();
    expect(mockSupabaseChannel).not.toHaveBeenCalled();
    expect(result.current.location).toBeNull();
  });

  it('fetches and returns the latest location_history row for the given otherUserId', async () => {
    const locationRow = createMockLocationRow(37.7749, -122.4194, '2024-01-01T00:00:00.000Z', 1.5, 45);
    const mockSelectChain = createMockSelectChain([locationRow]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.location).toEqual({
      latitude: 37.7749,
      longitude: -122.4194,
      recordedAt: '2024-01-01T00:00:00.000Z',
      speedMps: 1.5,
      headingDeg: 45,
    });
    expect(result.current.errorMessage).toBeNull();
  });

  it('maps snake_case database fields to camelCase', async () => {
    const locationRow = createMockLocationRow(40.7128, -74.006, '2024-01-02T12:34:56.000Z', 2.5, 90);
    const mockSelectChain = createMockSelectChain([locationRow]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.location).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
      recordedAt: '2024-01-02T12:34:56.000Z',
      speedMps: 2.5,
      headingDeg: 90,
    });
  });

  it('handles null speedMps and headingDeg', async () => {
    const locationRow = createMockLocationRow(37.7749, -122.4194, '2024-01-01T00:00:00.000Z', null, null);
    const mockSelectChain = createMockSelectChain([locationRow]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.location?.speedMps).toBeNull();
    expect(result.current.location?.headingDeg).toBeNull();
  });

  it('queries with correct filters and ordering', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(mockSupabaseFrom).toHaveBeenCalledWith('location_history');
    });

    const selectChain = mockSelectChain.select;
    expect(selectChain).toHaveBeenCalledWith('latitude, longitude, recorded_at, speed_mps, heading_deg');

    const eqChain = selectChain.mock.results[0].value;
    expect(eqChain.eq).toHaveBeenCalledWith('user_id', 'other-user-id');

    const orderChain = eqChain.eq.mock.results[0].value;
    expect(orderChain.order).toHaveBeenCalledWith('recorded_at', { ascending: false });

    const limitChain = orderChain.order.mock.results[0].value;
    expect(limitChain.limit).toHaveBeenCalledWith(1);
  });

  it('subscribes to a realtime channel with topic location_history:${otherUserId}', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(mockSupabaseChannel).toHaveBeenCalledWith('location_history:other-user-id');
    });
  });

  it('sets up channel filter for INSERT events on location_history table with user_id filter', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(mockChannel.on).toHaveBeenCalled();
    });

    const onCall = mockChannel.on.mock.calls[0];
    expect(onCall[0]).toBe('postgres_changes');
    expect(onCall[1]).toEqual({
      event: 'INSERT',
      schema: 'public',
      table: 'location_history',
      filter: 'user_id=eq.other-user-id',
    });
  });

  it('updates location state when a new INSERT event is received via the channel', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Simulate receiving a new INSERT event via the channel
    const newLocationRow = createMockLocationRow(37.8, -122.5, '2024-01-01T00:01:00.000Z', 2.0, 180);
    const payload = {
      new: newLocationRow,
      old: {} as unknown as LocationHistoryRow,
      errors: [] as string[],
      schema: 'public',
      table: 'location_history',
      commit_timestamp: new Date().toISOString(),
      eventType: 'INSERT',
    } as unknown as RealtimePostgresInsertPayload<LocationHistoryRow>;

    await act(async () => {
      capturedChannelCallback?.(payload);
    });

    expect(result.current.location).toEqual({
      latitude: 37.8,
      longitude: -122.5,
      recordedAt: '2024-01-01T00:01:00.000Z',
      speedMps: 2.0,
      headingDeg: 180,
    });
  });

  it('refetches on channel reaching SUBSCRIBED status', async () => {
    const initialLocationRow = createMockLocationRow(37.7749, -122.4194, '2024-01-01T00:00:00.000Z', 1.5, 45);
    const mockSelectChain = createMockSelectChain([initialLocationRow]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Initial fetch should have been called once
    const selectChain = mockSelectChain.select;
    const initialCallCount = selectChain.mock.calls.length;

    // Simulate the channel reaching SUBSCRIBED status
    await act(async () => {
      capturedSubscribeCallback?.(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
    });

    // Refetch should have occurred — select chain should be called again
    await waitFor(() => {
      expect(selectChain.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('removes the channel on unmount', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { unmount } = await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(mockSupabaseChannel).toHaveBeenCalled();
    });

    await act(async () => {
      unmount();
    });

    expect(mockSupabaseRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });

  it('tears down old channel and creates a new one when otherUserId changes', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { rerender } = await renderHook(
      ({ userId }: { userId: string | null }) => useOtherUserLocation(userId),
      {
        initialProps: { userId: 'user-1' },
      },
    );

    await waitFor(() => {
      expect(mockSupabaseChannel).toHaveBeenCalledWith('location_history:user-1');
    });

    const oldChannel = mockChannel;

    // Change otherUserId — the mock will be called again with new channel
    mockChannel = {
      on: jest.fn(),
      subscribe: jest.fn(),
    };
    mockChannel.on.mockImplementation(
      (event: string, filter: unknown, callback: (payload: RealtimePostgresInsertPayload<LocationHistoryRow>) => void) => {
        if (event === 'postgres_changes') {
          capturedChannelCallback = callback;
        }
        return mockChannel;
      },
    );
    mockChannel.subscribe.mockImplementation((statusCallback: (status: string) => void) => {
      capturedSubscribeCallback = statusCallback;
      return mockChannel;
    });
    mockSupabaseChannel.mockReturnValue(mockChannel);

    await act(async () => {
      rerender({ userId: 'user-2' });
    });

    // Old channel should be removed
    expect(mockSupabaseRemoveChannel).toHaveBeenCalledWith(oldChannel);

    // New channel should be created
    await waitFor(() => {
      expect(mockSupabaseChannel).toHaveBeenCalledWith('location_history:user-2');
    });
  });

  it('surfaces a fetch error via errorMessage without throwing', async () => {
    const errorMessage = 'Database connection failed';
    const mockSelectChain = createMockSelectChain([], { message: errorMessage });
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBe(errorMessage);
    expect(result.current.location).toBeNull();
  });

  it('clears errorMessage when a successful fetch follows an error', async () => {
    const mockSelectChain = createMockSelectChain([], { message: 'First error' });
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result, rerender } = await renderHook(
      ({ userId }: { userId: string | null }) => useOtherUserLocation(userId),
      {
        initialProps: { userId: 'other-user-id' },
      },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBe('First error');

    // Now mock a successful response
    const successLocationRow = createMockLocationRow(37.7749, -122.4194, '2024-01-01T00:00:00.000Z', 1.5, 45);
    const successMockSelectChain = createMockSelectChain([successLocationRow]);
    mockSupabaseFrom.mockReturnValue(successMockSelectChain as unknown as ReturnType<typeof supabase.from>);

    mockChannel = {
      on: jest.fn(),
      subscribe: jest.fn(),
    };
    mockChannel.on.mockImplementation(
      (event: string, filter: unknown, callback: (payload: RealtimePostgresInsertPayload<LocationHistoryRow>) => void) => {
        if (event === 'postgres_changes') {
          capturedChannelCallback = callback;
        }
        return mockChannel;
      },
    );
    mockChannel.subscribe.mockImplementation((statusCallback: (status: string) => void) => {
      capturedSubscribeCallback = statusCallback;
      return mockChannel;
    });
    mockSupabaseChannel.mockReturnValue(mockChannel);

    await act(async () => {
      rerender({ userId: 'other-user-id-2' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBeNull();
    expect(result.current.location).toEqual({
      latitude: 37.7749,
      longitude: -122.4194,
      recordedAt: '2024-01-01T00:00:00.000Z',
      speedMps: 1.5,
      headingDeg: 45,
    });
  });

  it('does not update state with channel events after unmount (isCancelled guard)', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result, unmount } = await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(mockSupabaseChannel).toHaveBeenCalled();
    });

    const locationBeforeUnmount = result.current.location;

    await act(async () => {
      unmount();
    });

    // Try to emit a channel event after unmount — should be ignored
    const newLocationRow = createMockLocationRow(37.8, -122.5, '2024-01-01T00:01:00.000Z', 2.0, 180);
    const payload = {
      new: newLocationRow,
      old: {} as unknown as LocationHistoryRow,
      errors: [] as string[],
      schema: 'public',
      table: 'location_history',
      commit_timestamp: new Date().toISOString(),
      eventType: 'INSERT',
    } as unknown as RealtimePostgresInsertPayload<LocationHistoryRow>;

    await act(async () => {
      capturedChannelCallback?.(payload);
    });

    // Component is already unmounted, so the late-arriving event must not
    // reach state — result.current stays frozen at its pre-unmount value.
    expect(result.current.location).toEqual(locationBeforeUnmount);
  });

  it('returns null location when zero rows are fetched', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.location).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('subscribes to the channel after querying', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    await renderHook(() => useOtherUserLocation('other-user-id'));

    await waitFor(() => {
      expect(mockSupabaseChannel).toHaveBeenCalled();
    });

    // The channel should have on() and subscribe() called in sequence
    expect(mockChannel.on).toHaveBeenCalled();
    expect(mockChannel.subscribe).toHaveBeenCalled();
  });
});
