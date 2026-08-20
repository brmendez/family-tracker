// features/map/components/FamilyMap.tsx
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { useGroupsContext } from '../../../context/groups.context';
import { MAP_INITIAL_DELTA } from '../../../lib/constants';
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
  const { coords, timestamp, errorMessage } = useForegroundLocation();
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const { groups, activeGroupId, setActiveGroupId, loading: groupsLoading } =
    useGroupsContext();
  const { members, loading: membersLoading } =
    useActiveGroupMembers(activeGroupId);
  const memberIds = useMemo(() => members.map((member) => member.id), [members]);
  const { locations } = useGroupMemberLocations(memberIds);

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
});
