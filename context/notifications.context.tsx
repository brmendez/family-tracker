// context/notifications.context.tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import {
  usePushRegistration,
  type PushPermissionState,
} from '../features/notifications/hooks/usePushRegistration';

type NotificationsContextValue = {
  pushPermissionStatus: PushPermissionState;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

// FT-15 fix: usePushRegistration owns the push-token-change subscription
// and permission request/registration side effects, so it must run once —
// this wraps that single call so pushPermissionStatus can be consumed by
// multiple screens (currently just GroupsScreen) without duplicating them.
export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const { status } = usePushRegistration();

  const value = useMemo<NotificationsContextValue>(
    () => ({ pushPermissionStatus: status }),
    [status],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
};

export const useNotificationsContext = (): NotificationsContextValue => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotificationsContext must be used within a NotificationsProvider');
  }

  return context;
};
