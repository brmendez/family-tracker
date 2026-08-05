// features/map/hooks/useLocationHistoryWriter.test.ts
import { act, renderHook } from '@testing-library/react-native';
import type { LocationObjectCoords } from 'expo-location';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';
import { useLocationHistoryWriter } from './useLocationHistoryWriter';

jest.mock('../../../context/auth.context');
jest.mock('../../../lib/supabase');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockSupabaseFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

const createMockCoords = (
  latitude: number = 37.7749,
  longitude: number = -122.4194,
  speed: number | null = 1.5,
  heading: number | null = 45,
  accuracy: number | null = 5,
): LocationObjectCoords => ({
  latitude,
  longitude,
  altitude: 10,
  accuracy,
  altitudeAccuracy: 2,
  heading,
  speed,
});

type WriterProps = { coords: LocationObjectCoords | null; timestamp: number | null };

const createMockInsertChain = (error: { message: string } | null = null) => {
  return {
    insert: jest.fn().mockResolvedValue({ data: null, error }),
  };
};

describe('useLocationHistoryWriter', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUseAuth.mockReturnValue({
      session: null,
      userId: 'test-user-id',
      profile: null,
      loading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does not insert when userId is missing', async () => {
    mockUseAuth.mockReturnValue({
      session: null,
      userId: null,
      profile: null,
      loading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    });

    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords();
    const timestamp = Date.now();

    await renderHook(() => useLocationHistoryWriter(coords, timestamp));

    expect(mockSupabaseFrom).not.toHaveBeenCalled();
    expect(mockInsertChain.insert).not.toHaveBeenCalled();
  });

  it('does not insert when coords is null', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const timestamp = Date.now();

    await renderHook(() => useLocationHistoryWriter(null, timestamp));

    expect(mockSupabaseFrom).not.toHaveBeenCalled();
    expect(mockInsertChain.insert).not.toHaveBeenCalled();
  });

  it('does not insert when timestamp is null', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords();

    await renderHook(() => useLocationHistoryWriter(coords, null));

    expect(mockSupabaseFrom).not.toHaveBeenCalled();
    expect(mockInsertChain.insert).not.toHaveBeenCalled();
  });

  it('inserts a location fix with all coordinates when userId, coords, and timestamp are present', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords(37.7749, -122.4194, 1.5, 45, 5);
    const timestamp = 1704067200000; // 2024-01-01 00:00:00 UTC

    await act(async () => {
      await renderHook(() => useLocationHistoryWriter(coords, timestamp));
    });

    expect(mockSupabaseFrom).toHaveBeenCalledWith('location_history');
    expect(mockInsertChain.insert).toHaveBeenCalledWith({
      user_id: 'test-user-id',
      latitude: 37.7749,
      longitude: -122.4194,
      recorded_at: new Date(timestamp).toISOString(),
      accuracy: 5,
      speed_mps: 1.5,
      heading_deg: 45,
    });
  });

  it('normalizes iOS -1 speed sentinel to null', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords(37.7749, -122.4194, -1, 45, 5);
    const timestamp = Date.now();

    await act(async () => {
      await renderHook(() => useLocationHistoryWriter(coords, timestamp));
    });

    const callArgs = mockInsertChain.insert.mock.calls[0][0];
    expect(callArgs.speed_mps).toBeNull();
  });

  it('normalizes iOS -1 heading sentinel to null', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords(37.7749, -122.4194, 1.5, -1, 5);
    const timestamp = Date.now();

    await act(async () => {
      await renderHook(() => useLocationHistoryWriter(coords, timestamp));
    });

    const callArgs = mockInsertChain.insert.mock.calls[0][0];
    expect(callArgs.heading_deg).toBeNull();
  });

  it('preserves positive speed values', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords(37.7749, -122.4194, 2.5, 45, 5);
    const timestamp = Date.now();

    await act(async () => {
      await renderHook(() => useLocationHistoryWriter(coords, timestamp));
    });

    const callArgs = mockInsertChain.insert.mock.calls[0][0];
    expect(callArgs.speed_mps).toBe(2.5);
  });

  it('preserves positive heading values', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords(37.7749, -122.4194, 1.5, 90, 5);
    const timestamp = Date.now();

    await act(async () => {
      await renderHook(() => useLocationHistoryWriter(coords, timestamp));
    });

    const callArgs = mockInsertChain.insert.mock.calls[0][0];
    expect(callArgs.heading_deg).toBe(90);
  });

  it('handles null speed and heading values', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords(37.7749, -122.4194, null, null, 5);
    const timestamp = Date.now();

    await act(async () => {
      await renderHook(() => useLocationHistoryWriter(coords, timestamp));
    });

    const callArgs = mockInsertChain.insert.mock.calls[0][0];
    expect(callArgs.speed_mps).toBeNull();
    expect(callArgs.heading_deg).toBeNull();
  });

  it('logs insert error via console.warn but does not throw', async () => {
    const errorMessage = 'Database connection failed';
    const mockInsertChain = createMockInsertChain({ message: errorMessage });
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords();
    const timestamp = Date.now();

    await act(async () => {
      await renderHook(() => useLocationHistoryWriter(coords, timestamp));
    });

    expect(warnSpy).toHaveBeenCalledWith('[location-history] insert failed:', errorMessage);
  });

  it('rewrites on userId change', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords();
    const timestamp = Date.now();

    const { rerender } = await renderHook(
      (props: WriterProps) => useLocationHistoryWriter(props.coords, props.timestamp),
      {
        initialProps: { coords, timestamp },
      },
    );

    expect(mockInsertChain.insert).toHaveBeenCalledTimes(1);
    expect(mockInsertChain.insert.mock.calls[0][0].user_id).toBe('test-user-id');

    mockUseAuth.mockReturnValue({
      session: null,
      userId: 'different-user-id',
      profile: null,
      loading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    });

    await act(async () => {
      rerender({ coords, timestamp });
    });

    expect(mockInsertChain.insert).toHaveBeenCalledTimes(2);
    expect(mockInsertChain.insert.mock.calls[1][0].user_id).toBe('different-user-id');
  });

  it('rewrites on coords change', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const timestamp = Date.now();
    const coords1 = createMockCoords(37.7749, -122.4194);
    const coords2 = createMockCoords(37.7750, -122.4195);

    const { rerender } = await renderHook(
      (props: WriterProps) => useLocationHistoryWriter(props.coords, props.timestamp),
      {
        initialProps: { coords: coords1, timestamp },
      },
    );

    expect(mockInsertChain.insert).toHaveBeenCalledTimes(1);
    expect(mockInsertChain.insert.mock.calls[0][0].latitude).toBe(37.7749);

    await act(async () => {
      rerender({ coords: coords2, timestamp });
    });

    expect(mockInsertChain.insert).toHaveBeenCalledTimes(2);
    expect(mockInsertChain.insert.mock.calls[1][0].latitude).toBe(37.7750);
  });

  it('rewrites on timestamp change', async () => {
    const mockInsertChain = createMockInsertChain();
    mockSupabaseFrom.mockReturnValue(mockInsertChain as unknown as ReturnType<typeof supabase.from>);

    const coords = createMockCoords();
    const timestamp1 = 1704067200000;
    const timestamp2 = 1704067300000;

    const { rerender } = await renderHook(
      (props: WriterProps) => useLocationHistoryWriter(props.coords, props.timestamp),
      {
        initialProps: { coords, timestamp: timestamp1 },
      },
    );

    expect(mockInsertChain.insert).toHaveBeenCalledTimes(1);
    expect(mockInsertChain.insert.mock.calls[0][0].recorded_at).toBe(
      new Date(timestamp1).toISOString(),
    );

    await act(async () => {
      rerender({ coords, timestamp: timestamp2 });
    });

    expect(mockInsertChain.insert).toHaveBeenCalledTimes(2);
    expect(mockInsertChain.insert.mock.calls[1][0].recorded_at).toBe(
      new Date(timestamp2).toISOString(),
    );
  });
});
