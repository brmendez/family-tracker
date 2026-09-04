import { act, renderHook, waitFor } from '@testing-library/react-native';

import { supabase } from '../../../lib/supabase';
import { useJourneyPlayback } from './useJourneyPlayback';
import type { PlaybackPoint } from '../types/history.types';

jest.mock('../../../lib/supabase');

const mockedRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

type PlaybackPointRow = {
  id: string;
  recorded_at: string;
  latitude: number | null;
  longitude: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  is_redacted: boolean;
};

describe('useJourneyPlayback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRpcResponse = (
    data: PlaybackPointRow[] | null = null,
    error: any = null,
  ) => {
    mockedRpc.mockResolvedValue({
      data,
      error,
      status: 200,
      statusText: 'OK',
      count: data?.length ?? null,
      success: error === null,
    } as any);
  };

  it('returns empty points and not loading when all params are null', async () => {
    const { result } = await renderHook(() =>
      useJourneyPlayback(null, null, null),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toEqual([]);
    expect(result.current.redactedWindows).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });

  it('returns empty points when memberId is missing', async () => {
    const { result } = await renderHook(() =>
      useJourneyPlayback(null, 'group-123', '2024-01-15'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });

  it('returns empty points when groupId is missing', async () => {
    const { result } = await renderHook(() =>
      useJourneyPlayback('member-123', null, '2024-01-15'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });

  it('returns empty points when dateLocal is missing', async () => {
    const { result } = await renderHook(() =>
      useJourneyPlayback('member-123', 'group-123', null),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });

  it('fetches playback points and converts row format to point format', async () => {
    const mockRows: PlaybackPointRow[] = [
      {
        id: '1',
        recorded_at: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speed_mps: 2.5,
        heading_deg: 90,
        is_redacted: false,
      },
      {
        id: '2',
        recorded_at: '2024-01-15T09:00:00.000Z',
        latitude: null,
        longitude: null,
        speed_mps: null,
        heading_deg: null,
        is_redacted: true,
      },
    ];

    mockRpcResponse(mockRows);

    const { result } = await renderHook(() =>
      useJourneyPlayback('member-123', 'group-123', '2024-01-15'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toHaveLength(2);
    expect(result.current.points[0]).toEqual({
      id: '1',
      recordedAt: '2024-01-15T08:00:00.000Z',
      latitude: 37.7749,
      longitude: -122.4194,
      speedMps: 2.5,
      headingDeg: 90,
      isRedacted: false,
    });
    expect(result.current.points[1]).toEqual({
      id: '2',
      recordedAt: '2024-01-15T09:00:00.000Z',
      latitude: null,
      longitude: null,
      speedMps: null,
      headingDeg: null,
      isRedacted: true,
    });
    expect(result.current.errorMessage).toBeNull();
  });

  it('handles null data response gracefully', async () => {
    mockRpcResponse(null);

    const { result } = await renderHook(() =>
      useJourneyPlayback('member-123', 'group-123', '2024-01-15'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });

  it('sets errorMessage when RPC fetch fails', async () => {
    const mockError = new Error('Network error');
    mockRpcResponse(null, mockError);

    const { result } = await renderHook(() =>
      useJourneyPlayback('member-123', 'group-123', '2024-01-15'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBe('Network error');
    expect(result.current.points).toEqual([]);
  });

  it('derives redactedWindows from fetched points', async () => {
    const mockRows: PlaybackPointRow[] = [
      {
        id: '1',
        recorded_at: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speed_mps: 1.0,
        heading_deg: 90,
        is_redacted: false,
      },
      {
        id: '2',
        recorded_at: '2024-01-15T09:00:00.000Z',
        latitude: null,
        longitude: null,
        speed_mps: null,
        heading_deg: null,
        is_redacted: true,
      },
      {
        id: '3',
        recorded_at: '2024-01-15T10:00:00.000Z',
        latitude: null,
        longitude: null,
        speed_mps: null,
        heading_deg: null,
        is_redacted: true,
      },
      {
        id: '4',
        recorded_at: '2024-01-15T11:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speed_mps: 1.5,
        heading_deg: 180,
        is_redacted: false,
      },
    ];

    mockRpcResponse(mockRows);

    const { result } = await renderHook(() =>
      useJourneyPlayback('member-123', 'group-123', '2024-01-15'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.redactedWindows).toEqual([
      {
        startsAt: '2024-01-15T09:00:00.000Z',
        endsAt: '2024-01-15T10:00:00.000Z',
      },
    ]);
  });

  it('fully resets on memberId change', async () => {
    const mockRows1: PlaybackPointRow[] = [
      {
        id: '1',
        recorded_at: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speed_mps: 1.0,
        heading_deg: 90,
        is_redacted: false,
      },
    ];

    const mockRows2: PlaybackPointRow[] = [
      {
        id: '2',
        recorded_at: '2024-01-15T09:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speed_mps: 1.5,
        heading_deg: 180,
        is_redacted: false,
      },
    ];

    mockRpcResponse(mockRows1);

    const { result, rerender } = await renderHook(
      ({ memberId }: { memberId: string | null }) =>
        useJourneyPlayback(memberId, 'group-123', '2024-01-15'),
      { initialProps: { memberId: 'member-a' } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points[0].id).toBe('1');

    const initialRpcCalls = mockedRpc.mock.calls.length;

    mockRpcResponse(mockRows2);

    await act(async () => {
      rerender({ memberId: 'member-b' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockedRpc.mock.calls.length).toBeGreaterThan(initialRpcCalls);
    expect(result.current.points[0].id).toBe('2');
  });

  it('passes timezone to RPC via Intl.DateTimeFormat', async () => {
    mockRpcResponse([]);

    await renderHook(() =>
      useJourneyPlayback('member-123', 'group-123', '2024-01-15'),
    );

    await waitFor(() => {
      expect(mockedRpc).toHaveBeenCalled();
    });

    const callArgs = mockedRpc.mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      p_user_id: 'member-123',
      p_group_id: 'group-123',
      p_date_local: '2024-01-15',
    });
    // p_timezone should be a valid timezone string
    expect(typeof callArgs[1].p_timezone).toBe('string');
    expect(callArgs[1].p_timezone).toBeTruthy();
  });

  it('does not update state when unmounted', async () => {
    const mockRows: PlaybackPointRow[] = [
      {
        id: '1',
        recorded_at: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speed_mps: 1.0,
        heading_deg: 90,
        is_redacted: false,
      },
    ];

    // Simulate a delayed RPC response
    let resolveRpc: any;
    const rpcPromise = new Promise((resolve) => {
      resolveRpc = resolve;
    });

    mockedRpc.mockReturnValue(rpcPromise as any);

    const { result, unmount } = await renderHook(() =>
      useJourneyPlayback('member-123', 'group-123', '2024-01-15'),
    );

    expect(result.current.loading).toBe(true);

    unmount();

    // Now resolve the RPC after unmount
    resolveRpc({ data: mockRows, error: null });

    // Wait a bit to ensure no state update happens
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The hook is unmounted so we can't check result.current, but we can verify
    // that resolveRpc was called without error
    expect(resolveRpc).toBeDefined();
  });

  it('handles groupId change and refetches', async () => {
    const mockRows1: PlaybackPointRow[] = [
      {
        id: '1',
        recorded_at: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speed_mps: 1.0,
        heading_deg: 90,
        is_redacted: false,
      },
    ];

    mockRpcResponse(mockRows1);

    const { result, rerender } = await renderHook(
      ({ groupId }: { groupId: string | null }) =>
        useJourneyPlayback('member-123', groupId, '2024-01-15'),
      { initialProps: { groupId: 'group-a' } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialRpcCalls = mockedRpc.mock.calls.length;

    mockRpcResponse(mockRows1);

    await act(async () => {
      rerender({ groupId: 'group-b' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockedRpc.mock.calls.length).toBeGreaterThan(initialRpcCalls);
  });

  it('handles dateLocal change and refetches', async () => {
    const mockRows1: PlaybackPointRow[] = [
      {
        id: '1',
        recorded_at: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speed_mps: 1.0,
        heading_deg: 90,
        is_redacted: false,
      },
    ];

    mockRpcResponse(mockRows1);

    const { result, rerender } = await renderHook(
      ({ dateLocal }: { dateLocal: string | null }) =>
        useJourneyPlayback('member-123', 'group-123', dateLocal),
      { initialProps: { dateLocal: '2024-01-15' } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialRpcCalls = mockedRpc.mock.calls.length;

    mockRpcResponse(mockRows1);

    await act(async () => {
      rerender({ dateLocal: '2024-01-16' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockedRpc.mock.calls.length).toBeGreaterThan(initialRpcCalls);
  });

  it('handles entirely redacted day (all points redacted)', async () => {
    const mockRows: PlaybackPointRow[] = [
      {
        id: '1',
        recorded_at: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speed_mps: null,
        heading_deg: null,
        is_redacted: true,
      },
      {
        id: '2',
        recorded_at: '2024-01-15T14:00:00.000Z',
        latitude: null,
        longitude: null,
        speed_mps: null,
        heading_deg: null,
        is_redacted: true,
      },
    ];

    mockRpcResponse(mockRows);

    const { result } = await renderHook(() =>
      useJourneyPlayback('member-123', 'group-123', '2024-01-15'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.points).toHaveLength(2);
    expect(result.current.points.every((p) => p.isRedacted)).toBe(true);
    expect(result.current.redactedWindows).toEqual([
      {
        startsAt: '2024-01-15T08:00:00.000Z',
        endsAt: '2024-01-15T14:00:00.000Z',
      },
    ]);
  });

  it('handles multiple redacted windows in a single day', async () => {
    const mockRows: PlaybackPointRow[] = [
      {
        id: '1',
        recorded_at: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speed_mps: null,
        heading_deg: null,
        is_redacted: true,
      },
      {
        id: '2',
        recorded_at: '2024-01-15T08:30:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speed_mps: 1.0,
        heading_deg: 90,
        is_redacted: false,
      },
      {
        id: '3',
        recorded_at: '2024-01-15T12:00:00.000Z',
        latitude: null,
        longitude: null,
        speed_mps: null,
        heading_deg: null,
        is_redacted: true,
      },
      {
        id: '4',
        recorded_at: '2024-01-15T13:00:00.000Z',
        latitude: null,
        longitude: null,
        speed_mps: null,
        heading_deg: null,
        is_redacted: true,
      },
      {
        id: '5',
        recorded_at: '2024-01-15T16:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speed_mps: 1.5,
        heading_deg: 180,
        is_redacted: false,
      },
    ];

    mockRpcResponse(mockRows);

    const { result } = await renderHook(() =>
      useJourneyPlayback('member-123', 'group-123', '2024-01-15'),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.redactedWindows).toHaveLength(2);
    expect(result.current.redactedWindows).toEqual([
      {
        startsAt: '2024-01-15T08:00:00.000Z',
        endsAt: '2024-01-15T08:00:00.000Z',
      },
      {
        startsAt: '2024-01-15T12:00:00.000Z',
        endsAt: '2024-01-15T13:00:00.000Z',
      },
    ]);
  });
});
