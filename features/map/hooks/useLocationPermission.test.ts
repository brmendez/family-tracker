// features/map/hooks/useLocationPermission.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import type { LocationPermissionResponse } from 'expo-location';

import { useLocationPermission } from './useLocationPermission';

jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));

const mockGetForegroundPermissionsAsync =
  Location.getForegroundPermissionsAsync as jest.MockedFunction<
    typeof Location.getForegroundPermissionsAsync
  >;
const mockRequestForegroundPermissionsAsync =
  Location.requestForegroundPermissionsAsync as jest.MockedFunction<
    typeof Location.requestForegroundPermissionsAsync
  >;

// Only `status`/`canAskAgain` actually drive toPermissionState, but the
// real LocationPermissionResponse also requires expires/granted — typing
// the mocked functions above against the real client means an incomplete
// literal here is a compile error, not a silent gap.
const permissionResponse = (
  status: Location.PermissionStatus,
  canAskAgain: boolean,
): LocationPermissionResponse => ({
  status,
  canAskAgain,
  granted: status === Location.PermissionStatus.GRANTED,
  expires: 'never',
});

describe('useLocationPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts in the checking state before the initial permission check resolves', async () => {
    let resolvePermissionsCheck: (value: LocationPermissionResponse) => void =
      () => {};

    mockGetForegroundPermissionsAsync.mockReturnValue(
      new Promise((resolve) => {
        resolvePermissionsCheck = resolve;
      }),
    );

    const { result } = await renderHook(() => useLocationPermission());

    expect(result.current.status).toBe('checking');

    await act(async () => {
      resolvePermissionsCheck(
        permissionResponse(Location.PermissionStatus.GRANTED, true),
      );
    });

    await waitFor(() => expect(result.current.status).toBe('granted'));
  });

  it('maps a granted response to the granted status on mount', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.GRANTED, true),
    );

    const { result } = await renderHook(() => useLocationPermission());

    await waitFor(() => expect(result.current.status).toBe('granted'));
  });

  it('maps a denied response with canAskAgain false to the denied status on mount', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.DENIED, false),
    );

    const { result } = await renderHook(() => useLocationPermission());

    await waitFor(() => expect(result.current.status).toBe('denied'));
  });

  it('maps a not-yet-asked response to the undetermined status on mount', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.UNDETERMINED, true),
    );

    const { result } = await renderHook(() => useLocationPermission());

    await waitFor(() => expect(result.current.status).toBe('undetermined'));
  });

  it('maps an Android "denied but can ask again" response to the undetermined status on mount', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.DENIED, true),
    );

    const { result } = await renderHook(() => useLocationPermission());

    await waitFor(() => expect(result.current.status).toBe('undetermined'));
  });

  it('calls requestForegroundPermissionsAsync and updates status when the request is granted', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.UNDETERMINED, true),
    );
    mockRequestForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.GRANTED, true),
    );

    const { result } = await renderHook(() => useLocationPermission());

    await waitFor(() => expect(result.current.status).toBe('undetermined'));

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('granted');
  });

  it('calls requestForegroundPermissionsAsync and updates status to denied when the request is rejected', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.UNDETERMINED, true),
    );
    mockRequestForegroundPermissionsAsync.mockResolvedValue(
      permissionResponse(Location.PermissionStatus.DENIED, false),
    );

    const { result } = await renderHook(() => useLocationPermission());

    await waitFor(() => expect(result.current.status).toBe('undetermined'));

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('denied');
  });
});
