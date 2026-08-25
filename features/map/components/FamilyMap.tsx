// features/map/components/FamilyMap.tsx
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, type Region } from 'react-native-maps';

import { useGroupsContext } from '../../../context/groups.context';
import { MAP_INITIAL_DELTA } from '../../../lib/constants';
import { useGeofences } from '../../geofencing/hooks/useGeofences';
import { useActiveGroupMembers } from '../hooks/useActiveGroupMembers';
import { useForegroundLocation } from '../hooks/useForegroundLocation';
import { useGroupMemberLocations } from '../hooks/useGroupMemberLocations';
import { useLocationHistoryWriter } from '../hooks/useLocationHistoryWriter';
import { GroupSwitcher } from './GroupSwitcher';
import { OtherUserMarker } from './OtherUserMarker';

// Plain Marker (not the native blue dot) — future avatar marker.
// Assumes foreground permission already granted (LocationPermissionGate).
//
// FT-12: generalizes from "the other user" (v1 hardcode) to "the active
// group's other members," switchable via GroupSwitcher per decision #4.
export const FamilyMap = () => {
  const router = useRouter();
  const { coords, timestamp, errorMessage } = useForegroundLocation();
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const { groups, activeGroupId, setActiveGroupId, loading: groupsLoading } =
    useGroupsContext();
  const { members, loading: membersLoading } =
    useActiveGroupMembers(activeGroupId);
  const memberIds = useMemo(() => members.map((member) => member.id), [members]);
  const { locations } = useGroupMemberLocations(memberIds);
  const { geofences, refetch: refetchGeofences } = useGeofences(
    activeGroupId ?? undefined,
  );

  useFocusEffect(
    useCallback(() => {
      refetchGeofences();
    }, [refetchGeofences]),
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
        <ActivityIndicator size="large" accessibilityLabel="Loading" />
      </View>
    );
  }

  const visibleMembers = members.filter((member) => locations[member.id]);
  const noGroups = !groupsLoading && groups.length === 0;
  const noOtherMembers =
    !groupsLoading && !membersLoading && groups.length > 0 && members.length === 0;

  return (
    <View style={styles.container}>
      <GroupSwitcher
        groups={groups}
        activeGroupId={activeGroupId}
        onSelect={setActiveGroupId}
      />
      {activeGroupId ? (
        <Pressable
          style={styles.placesButton}
          onPress={() => router.push('/places')}
          accessibilityLabel="Zones"
        >
          <Text style={styles.placesButtonText}>Zones</Text>
        </Pressable>
      ) : null}
      <MapView style={styles.map} initialRegion={initialRegion}>
        <Marker
          coordinate={{ latitude: coords.latitude, longitude: coords.longitude }}
          title="You"
          accessibilityLabel="Your location"
        />
        {visibleMembers.map((member) => (
          <OtherUserMarker
            key={member.id}
            displayName={member.displayName}
            location={locations[member.id]}
          />
        ))}
        {geofences.map((geofence) => (
          <Marker
            key={geofence.id}
            coordinate={{ latitude: geofence.latitude, longitude: geofence.longitude }}
            pinColor="#2563eb"
            accessibilityLabel={`Zone: ${geofence.name}`}
          >
            <Callout onPress={() => router.push(`/places/${geofence.id}`)}>
              <View style={styles.calloutContainer}>
                <Text style={styles.calloutTitle}>{geofence.name}</Text>
                <Text style={styles.calloutEdit}>Edit</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>
      {noGroups ? (
        <Text style={styles.waitingText}>
          Join or create a group to see family members
        </Text>
      ) : noOtherMembers ? (
        <Text style={styles.waitingText}>No other members here yet</Text>
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
  placesButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  placesButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  calloutContainer: {
    minWidth: 120,
    padding: 4,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  calloutEdit: {
    marginTop: 4,
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '600',
  },
});
