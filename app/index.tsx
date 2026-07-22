// app/index.tsx
import { StyleSheet, Text, View } from 'react-native';

import { LocationPermissionGate } from '../features/map/components/LocationPermissionGate';

export default function IndexScreen() {
  return (
    <LocationPermissionGate>
      {/* Placeholder for the granted state — FT-4 replaces this with the
          real map screen. */}
      <View style={styles.container}>
        <Text style={styles.text}>Location permission granted</Text>
      </View>
    </LocationPermissionGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 20,
    fontWeight: '600',
  },
});
