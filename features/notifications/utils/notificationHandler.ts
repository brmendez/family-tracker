// features/notifications/utils/notificationHandler.ts
// FT-17: Notification handler that suppresses banner/sound for geofence_alert
// notifications since FT-16's realtime in-app alert already covers that case
// when foregrounded. Extracted as a separate function for testability.
import type { Notification, NotificationBehavior } from 'expo-notifications';

export const handleNotification = async (
  notification: Notification,
): Promise<NotificationBehavior> => {
  // FT-17: geofence_alert already shows via FT-16's realtime in-app
  // banner when foregrounded -- suppress the native banner/sound so the
  // same crossing doesn't show twice.
  if (notification.request.content.data?.type === 'geofence_alert') {
    return {
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  }

  // FT-15: Default behavior for all other notification types.
  return {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  };
};
