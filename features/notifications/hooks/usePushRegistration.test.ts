// features/notifications/hooks/usePushRegistration.test.ts
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { renderHook, waitFor } from '@testing-library/react-native';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';
import { flush } from '../../../test/utils';
import { usePushRegistration } from './usePushRegistration';

jest.mock('expo-constants');
jest.mock('expo-notifications');
jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');

const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;
const mockedConstants = Constants as jest.Mocked<typeof Constants>;
const mockedFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

let warnSpy: jest.SpiedFunction<typeof console.warn>;

describe('usePushRegistration', () => {
  const mockUpsert = jest.fn();
  const mockSubscription = { remove: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockedConstants.expoConfig = {
      extra: { eas: { projectId: 'test-project-id' } },
    } as any;

    mockedFrom.mockReturnValue({
      upsert: mockUpsert,
    } as unknown as ReturnType<typeof supabase.from>);

    mockUpsert.mockResolvedValue({ data: null, error: null });

    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: Notifications.PermissionStatus.UNDETERMINED,
    } as any);

    mockedNotifications.requestPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: Notifications.PermissionStatus.UNDETERMINED,
    } as any);

    mockedNotifications.getExpoPushTokenAsync.mockResolvedValue({
      data: 'mock-push-token',
    } as any);

    mockedNotifications.addPushTokenListener.mockReturnValue(mockSubscription as any);

    mockedUseAuth.mockReturnValue({
      userId: 'user-123',
      user: null,
      loading: false,
      error: null,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    warnSpy.mockRestore();
  });

  it('returns undetermined status initially', async () => {
    const { result } = await renderHook(() => usePushRegistration());
    expect(result.current.status).toBe('undetermined');
  });

  it('requests notification permission when status is undetermined', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: Notifications.PermissionStatus.UNDETERMINED,
    } as any);

    await renderHook(() => usePushRegistration());
    await flush();

    expect(mockedNotifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('does not request permission when already determined', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: false,
      status: Notifications.PermissionStatus.GRANTED,
    } as any);

    await renderHook(() => usePushRegistration());
    await flush();

    expect(mockedNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('maps granted permission to granted status', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: false,
      status: Notifications.PermissionStatus.GRANTED,
    } as any);

    const { result } = await renderHook(() => usePushRegistration());

    await waitFor(() => {
      expect(result.current.status).toBe('granted');
    });
  });

  it('maps denied permission (canAskAgain=false) to denied status', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: Notifications.PermissionStatus.DENIED,
    } as any);

    const { result } = await renderHook(() => usePushRegistration());

    await waitFor(() => {
      expect(result.current.status).toBe('denied');
    });
  });

  it('fetches expo push token when permission is granted', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: false,
      status: Notifications.PermissionStatus.GRANTED,
    } as any);

    await renderHook(() => usePushRegistration());
    await flush();

    expect(mockedNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'test-project-id',
    });
  });

  it('upserts token with correct onConflict when granted', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: false,
      status: Notifications.PermissionStatus.GRANTED,
    } as any);

    await renderHook(() => usePushRegistration());
    await flush();

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        expo_push_token: 'mock-push-token',
      }),
      { onConflict: 'expo_push_token' },
    );
  });

  it('does not fetch token when permission denied', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: Notifications.PermissionStatus.DENIED,
    } as any);

    await renderHook(() => usePushRegistration());
    await flush();

    expect(mockedNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('handles getExpoPushTokenAsync errors gracefully', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: false,
      status: Notifications.PermissionStatus.GRANTED,
    } as any);

    mockedNotifications.getExpoPushTokenAsync.mockRejectedValue(
      new Error('Token fetch failed'),
    );

    await renderHook(() => usePushRegistration());
    await flush();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[notifications] failed to fetch push token'),
      expect.any(Error),
    );
  });

  it('handles upsert errors gracefully', async () => {
    mockedNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: false,
      status: Notifications.PermissionStatus.GRANTED,
    } as any);

    mockUpsert.mockResolvedValue({
      data: null,
      error: new Error('Upsert failed') as any,
    });

    await renderHook(() => usePushRegistration());
    await flush();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[notifications] failed to upsert push token'),
      'Upsert failed',
    );
  });

  it('subscribes to token change listener', async () => {
    await renderHook(() => usePushRegistration());
    await flush();

    expect(mockedNotifications.addPushTokenListener).toHaveBeenCalled();
  });

  it('does not initialize when no userId', async () => {
    mockedUseAuth.mockReturnValue({
      userId: null,
      user: null,
      loading: false,
      error: null,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    } as any);

    await renderHook(() => usePushRegistration());
    await flush();

    expect(mockedNotifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedNotifications.addPushTokenListener).not.toHaveBeenCalled();
  });
});
