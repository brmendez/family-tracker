// features/notifications/hooks/usePushRegistration.ts
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';

export type PushPermissionState = 'granted' | 'denied' | 'undetermined';

type UsePushRegistrationResult = {
  status: PushPermissionState;
};

const toPushPermissionState = (
  response: Notifications.NotificationPermissionsStatus,
): PushPermissionState => {
  if (response.granted) {
    return 'granted';
  }

  if (!response.canAskAgain) {
    return 'denied';
  }

  return 'undetermined';
};

const upsertToken = async (userId: string, expoPushToken: string): Promise<void> => {
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: expoPushToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' },
  );

  if (error) {
    console.warn('[notifications] failed to upsert push token:', error.message);
  }
};

const registerToken = async (userId: string): Promise<void> => {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;

  try {
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    await upsertToken(userId, expoPushToken);
  } catch (fetchError) {
    // Most commonly a simulator (no APNs entitlement) or a transient
    // network failure — not fatal, just means this device stays
    // unregistered until the next authenticated load.
    console.warn('[notifications] failed to fetch push token:', fetchError);
  }
};

/**
 * FT-15: requests notification permission on first authenticated load
 * (invoked once from app/(app)/_layout.tsx) and, once granted, upserts
 * the device's Expo push token onto push_tokens. Mirrors
 * useLocationPermission's request/granted/denied shape, but isn't a
 * gate — the app is fully usable with notifications denied;
 * NotificationPermissionBanner is the only UI this status drives.
 *
 * Also re-checks permission whenever the app returns to the foreground
 * (AppState 'active'), not just on mount: returning from Settings after
 * toggling permission resumes the existing app session rather than
 * relaunching it, so a mount-only check would never notice the change.
 *
 * Also subscribes to Expo's push-token-change listener: the listener
 * itself only reports the raw native device token, so on fire this
 * re-fetches the Expo push token and re-upserts it, covering rare OS
 * token rotation without a fresh permission prompt.
 */
export const usePushRegistration = (): UsePushRegistrationResult => {
  const { userId } = useAuth();
  const [status, setStatus] = useState<PushPermissionState>('undetermined');

  useEffect(() => {
    if (!userId) {
      return;
    }

    let isCancelled = false;

    const requestAndRegister = async () => {
      const current = await Notifications.getPermissionsAsync();
      const response =
        current.status === Notifications.PermissionStatus.UNDETERMINED
          ? await Notifications.requestPermissionsAsync()
          : current;

      if (isCancelled) {
        return;
      }

      setStatus(toPushPermissionState(response));

      if (response.granted) {
        await registerToken(userId);
      }
    };

    requestAndRegister();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        requestAndRegister();
      }
    });

    return () => {
      isCancelled = true;
      appStateSubscription.remove();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    // Re-fetching the Expo push token here can itself trigger another
    // native device-token event on some devices, which would otherwise
    // retrigger this listener as soon as the previous call finishes —
    // a self-sustaining loop. A minimum interval between calls (not just
    // an in-flight guard) is what actually breaks that cycle; a real
    // token rotation is rare enough that a short cooldown doesn't lose it.
    let isRegistering = false;
    let lastHandledAt = 0;
    const MIN_INTERVAL_MS = 5000;

    const subscription = Notifications.addPushTokenListener(() => {
      const now = Date.now();
      if (isRegistering || now - lastHandledAt < MIN_INTERVAL_MS) {
        return;
      }

      isRegistering = true;
      lastHandledAt = now;
      registerToken(userId).finally(() => {
        isRegistering = false;
      });
    });

    return () => {
      subscription.remove();
    };
  }, [userId]);

  return { status };
};
