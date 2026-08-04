// features/map/components/CurrentLocationMap.tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { MAP_INITIAL_DELTA } from '../../../lib/constants';
import { useForegroundLocation } from '../hooks/useForegroundLocation';
import { useLocationHistoryWriter } from '../hooks/useLocationHistoryWriter';

// Renders the map centered on the user's own current position, with a
// single marker that tracks it. Uses a plain Marker rather than MapView's
// native "blue dot" (showsUserLocation) on purpose: the eventual direction
// is avatar/profile-picture markers for both yourself and other family
// members (see ARCHITECTURE.md), which requires a customizable Marker, not
// the fixed-appearance blue dot — starting with Marker now means that's an
// additive upgrade later, not a rework. Assumes foreground location
// permission has already been granted by the time this mounts (see
// LocationPermissionGate in app/index.tsx). Writes the live stream to
// location_history in the background via useLocationHistoryWriter (FT-5).
// Showing other users (FT-6) is still out of scope here.
export const CurrentLocationMap = () => {
  const { coords, timestamp, errorMessage } = useForegroundLocation();
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);

  useLocationHistoryWriter(coords, timestamp);

  useEffect(() => {
    if (initialRegion || !coords) {
      return;
    }

    setInitialRegion({
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: MAP_INITIAL_DELTA,
      longitudeDelta: MAP_INITIAL_DELTA,
    });
  }, [coords, initialRegion]);

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </View>
    );
  }

  if (!coords || !initialRegion) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <MapView style={styles.map} initialRegion={initialRegion}>
      <Marker
        coordinate={{ latitude: coords.latitude, longitude: coords.longitude }}
        title="You"
        accessibilityLabel="Your location"
      />
    </MapView>
  );
};

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#444',
    textAlign: 'center',
  },
});
