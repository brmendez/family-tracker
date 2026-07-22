// features/map/components/LocationPermissionGate.tsx
import { useCallback, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useLocationPermission } from '../hooks/useLocationPermission';

type LocationPermissionGateProps = {
  children: ReactNode;
};

// Renders one of three states based on foreground location permission:
// not-yet-determined (request flow), granted (renders children), or denied
// (Settings deep link, since iOS won't show a fresh in-app prompt once
// already denied).
export function LocationPermissionGate({ children }: LocationPermissionGateProps) {
  const { status, requestPermission } = useLocationPermission();

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  if (status === 'checking') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (status === 'granted') {
    return <>{children}</>;
  }

  if (status === 'denied') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Location access is off</Text>
        <Text style={styles.body}>
          Family Tracker can&apos;t show your location to your family group
          until you turn on location access in Settings.
        </Text>
        <Pressable style={styles.button} onPress={handleOpenSettings}>
          <Text style={styles.buttonText}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Share your location</Text>
      <Text style={styles.body}>
        Family Tracker uses your location to show it to your family group on
        the map.
      </Text>
      <Pressable style={styles.button} onPress={requestPermission}>
        <Text style={styles.buttonText}>Allow Location Access</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#444',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
