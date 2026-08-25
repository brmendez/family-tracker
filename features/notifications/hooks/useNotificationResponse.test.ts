// features/notifications/hooks/useNotificationResponse.test.ts
import * as Notifications from 'expo-notifications';
import { act, renderHook } from '@testing-library/react-native';

import { useNotificationResponse } from './useNotificationResponse';

jest.mock('expo-notifications');

const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;

function mockNotificationCallback() {
  const callback = { current: (_response: any) => {} };
  mockedNotifications.addNotificationResponseReceivedListener.mockImplementation(
    (cb: any) => {
      callback.current = cb;
      return { remove: jest.fn() } as any;
    },
  );
  return callback;
}

describe('useNotificationResponse', () => {
  const mockSubscription = { remove: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedNotifications.addNotificationResponseReceivedListener.mockReturnValue(
      mockSubscription as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('subscribes to notification response listener on mount', async () => {
    await renderHook(() => useNotificationResponse());

    expect(mockedNotifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
  });

  it('returns null data initially', async () => {
    const { result } = await renderHook(() => useNotificationResponse());

    expect(result.current.data).toBeNull();
  });

  it('updates data when notification response is received', async () => {
    const callback = mockNotificationCallback();
    const { result } = await renderHook(() => useNotificationResponse());

    const mockNotificationData = { type: 'geofence_entry', geofenceId: 'zone-123' };

    await act(async () => {
      callback.current({
        notification: {
          request: {
            content: { data: mockNotificationData },
          },
        },
      });
    });

    expect(result.current.data).toEqual(mockNotificationData);
  });

  it('handles undefined data payload by returning null', async () => {
    const callback = mockNotificationCallback();
    const { result } = await renderHook(() => useNotificationResponse());

    await act(async () => {
      callback.current({
        notification: {
          request: {
            content: { data: undefined },
          },
        },
      });
    });

    expect(result.current.data).toBeNull();
  });

  it('handles null data payload explicitly', async () => {
    const callback = mockNotificationCallback();
    const { result } = await renderHook(() => useNotificationResponse());

    await act(async () => {
      callback.current({
        notification: {
          request: {
            content: { data: null },
          },
        },
      });
    });

    expect(result.current.data).toBeNull();
  });

  it('updates data on subsequent notifications', async () => {
    const callback = mockNotificationCallback();
    const { result } = await renderHook(() => useNotificationResponse());

    const firstData = { type: 'geofence_entry' };
    const secondData = { type: 'activity_alert', severity: 'high' };

    await act(async () => {
      callback.current({
        notification: {
          request: { content: { data: firstData } },
        },
      });
    });

    expect(result.current.data).toEqual(firstData);

    await act(async () => {
      callback.current({
        notification: {
          request: { content: { data: secondData } },
        },
      });
    });

    expect(result.current.data).toEqual(secondData);
  });

  it('cleans up listener subscription on unmount', async () => {
    const { unmount } = await renderHook(() => useNotificationResponse());

    expect(mockedNotifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
    expect(mockSubscription.remove).not.toHaveBeenCalled();

    await unmount();

    expect(mockSubscription.remove).toHaveBeenCalled();
  });

  it('handles complex data structures in notification payload', async () => {
    const callback = mockNotificationCallback();
    const { result } = await renderHook(() => useNotificationResponse());

    const complexData = {
      type: 'geofence_entry',
      geofenceId: 'zone-123',
      geofenceName: 'Home',
      userId: 'user-456',
      memberName: 'John',
      timestamp: '2024-01-01T12:00:00Z',
      metadata: { accuracy: 'high', source: 'background' },
    };

    await act(async () => {
      callback.current({
        notification: {
          request: { content: { data: complexData } },
        },
      });
    });

    expect(result.current.data).toEqual(complexData);
  });
});
