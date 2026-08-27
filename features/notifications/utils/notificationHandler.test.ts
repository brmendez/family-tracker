// features/notifications/utils/notificationHandler.test.ts
import type { Notification } from 'expo-notifications';

import { handleNotification } from './notificationHandler';

describe('handleNotification (FT-17)', () => {
  const createNotification = (
    data?: Record<string, any>,
  ): Notification => {
    const now = Date.now();
    return {
      request: {
        content: {
          title: 'Test notification',
          body: 'Test body',
          data: data || {},
          sound: true,
          priority: 'default',
        },
        identifier: 'test-notification',
        trigger: null,
      },
      date: now,
    } as unknown as Notification;
  };

  describe('geofence_alert notifications', () => {
    it('suppresses banner and sound for geofence_alert type', async () => {
      const notification = createNotification({
        type: 'geofence_alert',
        geofenceId: 'zone-123',
        eventType: 'enter',
        userId: 'user-456',
        occurredAt: '2024-01-01T12:00:00Z',
      });

      const result = await handleNotification(notification);

      expect(result).toMatchObject({
        shouldShowBanner: false,
        shouldPlaySound: false,
        shouldShowList: true,
        shouldSetBadge: false,
      });
    });

    it('handles geofence_alert with minimal data payload', async () => {
      const notification = createNotification({
        type: 'geofence_alert',
      });

      const result = await handleNotification(notification);

      expect(result.shouldShowBanner).toBe(false);
      expect(result.shouldPlaySound).toBe(false);
    });
  });

  describe('non-geofence notifications', () => {
    it('shows banner for activity_alert type', async () => {
      const notification = createNotification({
        type: 'activity_alert',
        severity: 'high',
      });

      const result = await handleNotification(notification);

      expect(result.shouldShowBanner).toBe(true);
      expect(result.shouldPlaySound).toBe(false);
    });

    it('shows banner for unknown notification type', async () => {
      const notification = createNotification({
        type: 'unknown_type',
      });

      const result = await handleNotification(notification);

      expect(result.shouldShowBanner).toBe(true);
    });

    it('shows banner when data is empty object', async () => {
      const notification = createNotification({});

      const result = await handleNotification(notification);

      expect(result.shouldShowBanner).toBe(true);
    });

    it('shows banner when data.type is null', async () => {
      const notification = createNotification({
        type: null,
      });

      const result = await handleNotification(notification);

      expect(result.shouldShowBanner).toBe(true);
    });

    it('shows banner when data.type is undefined', async () => {
      const notification = createNotification({
        otherField: 'value',
      });

      const result = await handleNotification(notification);

      expect(result.shouldShowBanner).toBe(true);
    });

    it('shows banner when data is undefined', async () => {
      const notification: Notification = {
        request: {
          content: {
            title: 'Test',
            body: 'Test',
            data: undefined as any,
            sound: true,
            priority: 'default',
          },
          identifier: 'test',
          trigger: null,
        },
        date: Date.now(),
      } as unknown as Notification;

      const result = await handleNotification(notification);

      expect(result.shouldShowBanner).toBe(true);
    });
  });

  describe('FT-15 behavior unchanged', () => {
    it('never plays sound for any notification type', async () => {
      const notificationTypes = ['geofence_alert', 'activity_alert', 'other'];

      for (const type of notificationTypes) {
        const notification = createNotification({ type });
        const result = await handleNotification(notification);
        expect(result.shouldPlaySound).toBe(false);
      }
    });

    it('always shows list for all notifications', async () => {
      const notificationTypes = ['geofence_alert', 'activity_alert', 'other'];

      for (const type of notificationTypes) {
        const notification = createNotification({ type });
        const result = await handleNotification(notification);
        expect(result.shouldShowList).toBe(true);
      }
    });

    it('never sets badge for any notification type', async () => {
      const notificationTypes = ['geofence_alert', 'activity_alert', 'other'];

      for (const type of notificationTypes) {
        const notification = createNotification({ type });
        const result = await handleNotification(notification);
        expect(result.shouldSetBadge).toBe(false);
      }
    });
  });
});
