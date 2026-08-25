// features/notifications/hooks/useNotificationResponse.ts
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';

type UseNotificationResponseResult = {
  data: Record<string, unknown> | null;
};

/**
 * FT-15: subscribes to Expo's notification-tap listener and exposes the
 * tapped notification's data payload. No consumer exists yet — FT-17/
 * FT-27 will read `data.type` off this to route on tap instead of each
 * reimplementing the listener.
 */
export const useNotificationResponse = (): UseNotificationResponseResult => {
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      setData(response.notification.request.content.data ?? null);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return { data };
};
