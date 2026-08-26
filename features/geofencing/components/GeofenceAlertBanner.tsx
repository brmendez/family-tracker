// features/geofencing/components/GeofenceAlertBanner.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { GeofenceAlertEvent } from '../types/geofence.types';

type GeofenceAlertBannerProps = {
  alert: GeofenceAlertEvent | null;
  onDismiss: () => void;
};

/** Other-member crossing alert (FT-16, corrected); same visual language as NotificationPermissionBanner. */
export const GeofenceAlertBanner = ({ alert, onDismiss }: GeofenceAlertBannerProps) => {
  if (!alert) {
    return null;
  }

  const title =
    alert.eventType === 'enter'
      ? `${alert.displayName} entered ${alert.geofenceName}`
      : `${alert.displayName} left ${alert.geofenceName}`;

  return (
    <Pressable
      style={styles.banner}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel={`${title}. Dismiss`}
    >
      <View style={styles.textGroup}>
        <Text style={styles.title}>{title}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#e6f4ff',
    borderWidth: 1,
    borderColor: '#6db3f0',
    borderRadius: 8,
    padding: 12,
  },
  textGroup: {
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0a5a8a',
  },
});
