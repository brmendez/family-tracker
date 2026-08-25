// features/notifications/components/NotificationPermissionBanner.tsx
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * FT-15: the "ask again" surface for a denied notifications permission —
 * there's no dedicated Settings screen yet, so this lives on GroupsScreen
 * (the existing home screen) rather than spawning a new one. Renders
 * nothing unless the caller has already confirmed permission is denied;
 * unlike LocationPermissionGate, this never blocks the screen.
 */
export const NotificationPermissionBanner = () => {
  const handleOpenSettings = () => {
    Linking.openSettings();
  };

  return (
    <Pressable
      style={styles.banner}
      onPress={handleOpenSettings}
      accessibilityRole="button"
      accessibilityLabel="Open Settings to enable notifications"
    >
      <View style={styles.textGroup}>
        <Text style={styles.title}>Notifications are off</Text>
        <Text style={styles.body}>
          Turn on notifications in Settings to get alerts from your family group.
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
