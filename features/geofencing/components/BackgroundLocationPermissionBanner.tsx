// features/geofencing/components/BackgroundLocationPermissionBanner.tsx
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BackgroundGeofencePermissionState } from '../hooks/useBackgroundGeofencePermission';

type BackgroundLocationPermissionBannerProps = {
  status: BackgroundGeofencePermissionState;
  requestPermission: () => Promise<void>;
};

/**
 * Non-blocking banner (mirrors NotificationPermissionBanner) that asks for
 * "Always" location so FT-16/17's zone alerts survive backgrounding. Two
 * copy states: undetermined (in-app request) and denied (Settings deep link).
 */
export const BackgroundLocationPermissionBanner = ({
  status,
  requestPermission,
}: BackgroundLocationPermissionBannerProps) => {
  const handlePress = () => {
    if (status === 'denied') {
      Linking.openSettings();
      return;
    }

    requestPermission();
  };

  return (
    <Pressable
      style={styles.banner}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={
        status === 'denied'
          ? 'Open Settings to enable background location'
          : 'Allow background location access'
      }
    >
      <View style={styles.textGroup}>
        <Text style={styles.title}>
          {status === 'denied' ? 'Background location is off' : 'Get alerts even when the app is closed'}
        </Text>
        <Text style={styles.body}>
          {status === 'denied'
            ? 'Turn on "Always" location access in Settings so your family can be alerted when you arrive at or leave a Zone.'
            : 'Allow "Always" location access so your family can be alerted when you arrive at or leave a Zone, even when Family Tracker isn\'t open.'}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fff7e6',
    borderWidth: 1,
    borderColor: '#f0c36d',
    borderRadius: 8,
    padding: 12,
  },
  textGroup: {
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8a5a00',
  },
  body: {
    fontSize: 13,
    color: '#8a5a00',
  },
});
