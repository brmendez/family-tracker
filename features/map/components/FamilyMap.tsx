// features/map/components/FamilyMap.tsx
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, type Region } from 'react-native-maps';

import { useAuth } from '../../../context/auth.context';
import { useGroupsContext } from '../../../context/groups.context';
import { useNotificationsContext } from '../../../context/notifications.context';
import { MAP_INITIAL_DELTA } from '../../../lib/constants';
import { BackgroundLocationPermissionBanner } from '../../geofencing/components/BackgroundLocationPermissionBanner';
import { GeofenceAlertBanner } from '../../geofencing/components/GeofenceAlertBanner';
import { useBackgroundGeofencePermission } from '../../geofencing/hooks/useBackgroundGeofencePermission';
import { useBackgroundGeofenceRegistration } from '../../geofencing/hooks/useBackgroundGeofenceRegistration';
import { useGeofenceAlert } from '../../geofencing/hooks/useGeofenceAlert';
import { useGeofenceDetection } from '../../geofencing/hooks/useGeofenceDetection';
import { useGeofences } from '../../geofencing/hooks/useGeofences';
import { useLogGeofenceEvent } from '../../geofencing/hooks/useLogGeofenceEvent';
import { NotificationPermissionBanner } from '../../notifications/components/NotificationPermissionBanner';
import { VisibilityDurationSheet } from '../../visibility/components/VisibilityDurationSheet';
import { VisibilityToggleButton } from '../../visibility/components/VisibilityToggleButton';
import { useGroupVisibility } from '../../visibility/hooks/useGroupVisibility';
import { useSetGroupVisibility } from '../../visibility/hooks/useSetGroupVisibility';
import type { VisibilityDuration } from '../../visibility/types/visibility.types';
import { useActiveGroupMembers } from '../hooks/useActiveGroupMembers';
import { useDeconflictedMarkerPositions } from '../hooks/useDeconflictedMarkerPositions';
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
//
// FT-15: renders NotificationPermissionBanner when push permission is
// denied — this is the app's landing screen, so it lives here rather
// than (or in addition to) GroupsScreen, which most users won't visit.
//
// FT-16: foreground-only geofence detection off the coords/geofences
// already held here; alert is for OTHER members' crossings (realtime),
// not the crossing user's own — no push (see FT-17/18).
//
// FT-18: registers/tears down native background region monitoring off the
// same geofences, and asks for "Always" permission via a banner.
//
// FT-20: adds a per-group visibility toggle + duration sheet. Gating
// itself is 100% RLS (FT-19) — this component writes the override row,
// nothing here filters markers.
export const FamilyMap = () => {
  const router = useRouter();
  const { userId } = useAuth();
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
  const { state: visibilityState, refetch: refetchVisibility } =
    useGroupVisibility(activeGroupId);
  const {
    setVisibility,
    setting: settingVisibility,
    setErrorMessage: visibilityErrorMessage,
  } = useSetGroupVisibility(refetchVisibility);
  const [visibilitySheetOpen, setVisibilitySheetOpen] = useState(false);
  const { pushPermissionStatus } = useNotificationsContext();
  const {
    status: backgroundLocationStatus,
    requestPermission: requestBackgroundLocationPermission,
  } = useBackgroundGeofencePermission();
  useBackgroundGeofenceRegistration(activeGroupId, geofences, backgroundLocationStatus);

  useFocusEffect(
    useCallback(() => {
      refetchGeofences();
    }, [refetchGeofences]),
  );

  const handleSelectVisibilityDuration = async (duration: VisibilityDuration) => {
    if (!activeGroupId) {
      return;
    }

    const { error } = await setVisibility(activeGroupId, duration);

    if (!error) {
      setVisibilitySheetOpen(false);
    }
  };

  const handleUnhide = async () => {
    if (!activeGroupId) {
      return;
    }

    const { error } = await setVisibility(activeGroupId, 'unhide');

    if (!error) {
      setVisibilitySheetOpen(false);
    }
  };

  useLocationHistoryWriter(coords, timestamp);

  const { latestCrossing } = useGeofenceDetection(coords, timestamp, geofences);
  useLogGeofenceEvent(latestCrossing, userId);
  const { visibleAlert, dismiss: dismissGeofenceAlert } = useGeofenceAlert(
    activeGroupId,
    geofences,
    members,
    userId,
  );

  const visibleMembers = useMemo(
    () => members.filter((member) => locations[member.id]),
    [members, locations],
  );

  // FT-29: dedupe/nudge markers that render on top of each other (own
  // marker included — see ARCHITECTURE.md "why the own marker is included").
  const combinedPositions = useMemo(() => {
    if (!coords) {
      return [];
    }

    const memberPositions = visibleMembers.map((member) => ({
      id: member.id,
      latitude: locations[member.id].latitude,
      longitude: locations[member.id].longitude,
    }));

    if (!userId) {
      return memberPositions;
    }

    return [
      { id: userId, latitude: coords.latitude, longitude: coords.longitude },
      ...memberPositions,
    ];
  }, [coords, userId, visibleMembers, locations]);
  const resolvedPositions = useDeconflictedMarkerPositions(combinedPositions);

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

  const noGroups = !groupsLoading && groups.length === 0;
  const noOtherMembers =
    !groupsLoading && !membersLoading && groups.length > 0 && members.length === 0;

  return (
    <View style={styles.container}>
      {pushPermissionStatus === 'denied' ? (
        <View style={styles.bannerWrapper}>
          <NotificationPermissionBanner />
        </View>
      ) : null}
      {visibleAlert ? (
        <View style={styles.bannerWrapper}>
          <GeofenceAlertBanner alert={visibleAlert} onDismiss={dismissGeofenceAlert} />
        </View>
      ) : null}
      {(backgroundLocationStatus === 'undetermined' || backgroundLocationStatus === 'denied') &&
      groups.length > 0 ? (
        <View style={styles.bannerWrapper}>
          <BackgroundLocationPermissionBanner
            status={backgroundLocationStatus}
            requestPermission={requestBackgroundLocationPermission}
          />
        </View>
      ) : null}
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
      {activeGroupId ? (
        <VisibilityToggleButton
          isHidden={visibilityState.isHidden}
          onPress={() => setVisibilitySheetOpen(true)}
        />
      ) : null}
      {visibilitySheetOpen ? (
        <VisibilityDurationSheet
          visible={visibilitySheetOpen}
          isHidden={visibilityState.isHidden}
          setting={settingVisibility}
          errorMessage={visibilityErrorMessage}
          onSelectDuration={handleSelectVisibilityDuration}
          onUnhide={handleUnhide}
          onClose={() => setVisibilitySheetOpen(false)}
        />
      ) : null}
      <MapView style={styles.map} initialRegion={initialRegion}>
        <Marker
          coordinate={
            (userId && resolvedPositions[userId]) || {
              latitude: coords.latitude,
              longitude: coords.longitude,
            }
          }
          title="You"
          accessibilityLabel="Your location"
        />
        {visibleMembers.map((member) => (
          <OtherUserMarker
            key={member.id}
            displayName={member.displayName}
            location={locations[member.id]}
            coordinate={resolvedPositions[member.id]}
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
  bannerWrapper: {
    margin: 12,
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
