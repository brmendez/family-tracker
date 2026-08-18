// features/map/components/FamilyMap.tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { MAP_INITIAL_DELTA } from '../../../lib/constants';
import { useForegroundLocation } from '../hooks/useForegroundLocation';
import { useLocationHistoryWriter } from '../hooks/useLocationHistoryWriter';
import { useOtherProfile } from '../hooks/useOtherProfile';
import { useOtherUserLocation } from '../hooks/useOtherUserLocation';
import { OtherUserMarker } from './OtherUserMarker';

// Plain Marker (not the native blue dot) — future avatar marker.
// Assumes foreground permission already granted (LocationPermissionGate).
export const FamilyMap = () => {
  const { coords, timestamp, errorMessage } = useForegroundLocation();
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const { otherProfile } = useOtherProfile();
  const { location: otherLocation } = useOtherUserLocation(
    otherProfile?.id ?? null,
  );

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

  const otherDisplayName = otherProfile?.displayName ?? 'Family member';

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={initialRegion}>
        <Marker
          coordinate={{ latitude: coords.latitude, longitude: coords.longitude }}
          title="You"
          accessibilityLabel="Your location"
        />
        {otherLocation ? (
          <OtherUserMarker
            displayName={otherDisplayName}
            location={otherLocation}
          />
        ) : null}
      </MapView>
      {otherProfile && !otherLocation ? (
        <Text style={styles.waitingText}>
          Waiting for {otherDisplayName}'s first location update…
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  waitingText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    padding: 8,
  },
});
