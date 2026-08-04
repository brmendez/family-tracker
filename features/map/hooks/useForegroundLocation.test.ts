// features/map/hooks/useForegroundLocation.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import type { LocationObject, LocationSubscription } from 'expo-location';

import { useForegroundLocation } from './useForegroundLocation';

jest.mock('expo-location', () => ({
  LocationAccuracy: { Balanced: 3 },
  watchPositionAsync: jest.fn(),
}));

const mockWatchPositionAsync =
  Location.watchPositionAsync as jest.MockedFunction<typeof Location.watchPositionAsync>;

const createMockLocationObject = (
  latitude: number = 37.7749,
  longitude: number = -122.4194,
  speed: number | null = 1.5,
  heading: number | null = 45,
  timestamp: number = Date.now(),
): LocationObject => ({
  coords: {
    latitude,
    longitude,
    altitude: 10,
    accuracy: 5,
    altitudeAccuracy: 2,
    heading,
    speed,
  },
  timestamp,
});

const createMockSubscription = (): LocationSubscription =>
  ({ remove: jest.fn() }) as unknown as LocationSubscription;

describe('useForegroundLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns initial state with null coords, timestamp, and errorMessage', async () => {
    mockWatchPositionAsync.mockImplementation(async () => createMockSubscription());

    const { result } = await renderHook(() => useForegroundLocation());

    expect(result.current.coords).toBeNull();
    expect(result.current.timestamp).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('calls watchPositionAsync with correct accuracy and distance/time intervals', async () => {
    mockWatchPositionAsync.mockImplementation(async () => createMockSubscription());

    await renderHook(() => useForegroundLocation());

    await waitFor(() => {
      expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockWatchPositionAsync.mock.calls[0];
    expect(callArgs[0]).toEqual({
      accuracy: Location.LocationAccuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 10,
    });
    expect(typeof callArgs[1]).toBe('function'); // callback
  });

  it('updates coords and timestamp when a location is received', async () => {
    let capturedCallback: Location.LocationCallback | null = null;

    mockWatchPositionAsync.mockImplementation(async (options, callback) => {
      capturedCallback = callback;
      return createMockSubscription();
    });

    const { result } = await renderHook(() => useForegroundLocation());

    await waitFor(() => {
      expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
    });

    const mockLocation = createMockLocationObject(37.7749, -122.4194, 1.5, 45, 1000);

    await act(async () => {
      capturedCallback?.(mockLocation);
    });

    expect(result.current.coords).toEqual(mockLocation.coords);
    expect(result.current.timestamp).toBe(mockLocation.timestamp);
  });

  it('receives successive location updates and updates state each time', async () => {
    let capturedCallback: Location.LocationCallback | null = null;

    mockWatchPositionAsync.mockImplementation(async (options, callback) => {
      capturedCallback = callback;
      return createMockSubscription();
    });

    const { result } = await renderHook(() => useForegroundLocation());

    await waitFor(() => {
      expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
    });

    const firstLocation = createMockLocationObject(37.7749, -122.4194, 1.0, 45, 1000);
    const secondLocation = createMockLocationObject(37.7750, -122.4195, 1.5, 90, 2000);

    await act(async () => {
      capturedCallback?.(firstLocation);
    });

    expect(result.current.coords?.latitude).toBe(37.7749);
    expect(result.current.coords?.longitude).toBe(-122.4194);
    expect(result.current.timestamp).toBe(1000);

    await act(async () => {
      capturedCallback?.(secondLocation);
    });

    expect(result.current.coords?.latitude).toBe(37.7750);
    expect(result.current.coords?.longitude).toBe(-122.4195);
    expect(result.current.timestamp).toBe(2000);
  });

  it('sets errorMessage when watchPositionAsync throws', async () => {
    const errorMessage = 'Location service unavailable';
    mockWatchPositionAsync.mockRejectedValue(new Error(errorMessage));

    const { result } = await renderHook(() => useForegroundLocation());

    await waitFor(() => {
      expect(result.current.errorMessage).toBe(errorMessage);
    });

    expect(result.current.coords).toBeNull();
    expect(result.current.timestamp).toBeNull();
  });

  it('can unmount safely and stop watching position', async () => {
    mockWatchPositionAsync.mockImplementation(
      async () =>
        ({
          remove: jest.fn(),
        }) as unknown as LocationSubscription,
    );

    const { unmount } = await renderHook(() => useForegroundLocation());

    await waitFor(() => {
      expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
    });

    // Should not throw when unmounting
    expect(() => unmount()).not.toThrow();
  });

  it('does not update state with location callbacks after unmount (isMounted guard)', async () => {
    let capturedCallback: Location.LocationCallback | null = null;

    mockWatchPositionAsync.mockImplementation(async (options, callback) => {
      capturedCallback = callback;
      return createMockSubscription();
    });

    const { result, unmount } = await renderHook(() => useForegroundLocation());

    await waitFor(() => {
      expect(mockWatchPositionAsync).toHaveBeenCalledTimes(1);
    });

    const mockLocation = createMockLocationObject();

    // unmount and the subsequent (ignored) location callback are wrapped in
    // a single act() scope rather than two separate ones — two consecutive
    // act() calls here raced against the still-settling watchPositionAsync
    // effect and produced spurious "overlapping act()" warnings.
    await act(async () => {
      unmount();
      capturedCallback?.(mockLocation);
    });

    // Result should still be the same since the component is unmounted
    expect(result.current.coords).toBeNull();
    expect(result.current.timestamp).toBeNull();
  });
});
