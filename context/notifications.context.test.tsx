// context/notifications.context.test.tsx
jest.mock('../lib/supabase');
jest.mock('../context/auth.context');
jest.mock('../features/notifications/hooks/usePushRegistration');

import { renderHook, waitFor } from '@testing-library/react-native';

import { usePushRegistration } from '../features/notifications/hooks/usePushRegistration';
import { flush } from '../test/utils';
import { NotificationsProvider, useNotificationsContext } from './notifications.context';

const mockUsePushRegistration = usePushRegistration as jest.MockedFunction<
  typeof usePushRegistration
>;

describe('NotificationsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePushRegistration.mockReturnValue({ status: 'undetermined' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('provides pushPermissionStatus from usePushRegistration', async () => {
    mockUsePushRegistration.mockReturnValue({ status: 'granted' });

    const { result } = await renderHook(() => useNotificationsContext(), {
      wrapper: NotificationsProvider,
    });

    await waitFor(() => {
      expect(result.current.pushPermissionStatus).toBe('granted');
    });
  });

  it('exposes denied status from usePushRegistration', async () => {
    mockUsePushRegistration.mockReturnValue({ status: 'denied' });

    const { result } = await renderHook(() => useNotificationsContext(), {
      wrapper: NotificationsProvider,
    });

    await waitFor(() => {
      expect(result.current.pushPermissionStatus).toBe('denied');
    });
  });

  it('exposes undetermined status from usePushRegistration', async () => {
    mockUsePushRegistration.mockReturnValue({ status: 'undetermined' });

    const { result } = await renderHook(() => useNotificationsContext(), {
      wrapper: NotificationsProvider,
    });

    await waitFor(() => {
      expect(result.current.pushPermissionStatus).toBe('undetermined');
    });
  });

  it('updates status when usePushRegistration status changes', async () => {
    const { result, rerender } = await renderHook(() => useNotificationsContext(), {
      wrapper: NotificationsProvider,
    });

    await flush();

    mockUsePushRegistration.mockReturnValue({ status: 'undetermined' });
    await rerender(undefined);
    await flush();

    expect(result.current.pushPermissionStatus).toBe('undetermined');

    mockUsePushRegistration.mockReturnValue({ status: 'granted' });
    await rerender(undefined);
    await flush();

    expect(result.current.pushPermissionStatus).toBe('granted');
  });

  it('calls usePushRegistration exactly once at provider level', async () => {
    mockUsePushRegistration.mockReturnValue({ status: 'granted' });

    await renderHook(() => useNotificationsContext(), {
      wrapper: NotificationsProvider,
    });

    expect(mockUsePushRegistration).toHaveBeenCalledTimes(1);
  });
});

describe('useNotificationsContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when used outside NotificationsProvider', async () => {
    await expect(renderHook(() => useNotificationsContext())).rejects.toThrow(
      'useNotificationsContext must be used within a NotificationsProvider',
    );
  });

  it('returns the context value when used inside provider', async () => {
    mockUsePushRegistration.mockReturnValue({ status: 'granted' });

    const { result } = await renderHook(() => useNotificationsContext(), {
      wrapper: NotificationsProvider,
    });

    await flush();

    expect(result.current).toHaveProperty('pushPermissionStatus');
    expect(result.current.pushPermissionStatus).toBe('granted');
  });
});
