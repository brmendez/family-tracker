// features/geofencing/components/EditPlaceScreen.tsx
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Region } from 'react-native-maps';

import { useAuth } from '../../../context/auth.context';
import { useGroupsContext } from '../../../context/groups.context';
import { useGroups } from '../../groups/hooks/useGroups';
import { MAP_INITIAL_DELTA } from '../../../lib/constants';
import { useDeleteGeofence } from '../hooks/useDeleteGeofence';
import {
  useGeocodeAddress,
  type GeocodedLocation,
} from '../hooks/useGeocodeAddress';
import { useGeofences } from '../hooks/useGeofences';
import { useUpdateGeofence } from '../hooks/useUpdateGeofence';
import {
  MapLocationPicker,
  type MapLocationPickerResult,
} from './MapLocationPicker';
import {
  feetToMeters,
  metersToFeet,
  RADIUS_MAX_FT,
  RADIUS_MIN_FT,
} from '../radius';

const NAME_EMPTY_MESSAGE = "Zone name can't be empty.";

/** Edit a zone; read-only for members who aren't its creator or the group owner. */
export const EditPlaceScreen = () => {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const router = useRouter();
  const { activeGroupId } = useGroupsContext();
  const { userId } = useAuth();
  const { groups } = useGroups();
  const { geofences, loading: geofencesLoading } = useGeofences(
    activeGroupId ?? undefined,
  );
  const { updateGeofence, updating, updateErrorMessage } = useUpdateGeofence();
  const { deleteGeofence, deleting, deleteErrorMessage } = useDeleteGeofence();
  const { geocodeAddress, geocoding, geocodeErrorMessage } =
    useGeocodeAddress();

  const place =
    geofences.find((candidate) => candidate.id === placeId) ?? null;
  const activeGroup = groups.find((candidate) => candidate.id === activeGroupId);
  const canManage = place
    ? place.createdBy === userId || activeGroup?.role === 'owner'
    : false;

  const [name, setName] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [location, setLocation] = useState<GeocodedLocation | null>(null);
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(
    null,
  );
  const [radiusFt, setRadiusFt] = useState(RADIUS_MIN_FT);
  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(
    null,
  );

  const prefilledRef = useRef(false);

  // Seed form state from the fetched place once, so a later refetch (or the
  // continuous location updates below) doesn't stomp in-progress edits.
  useEffect(() => {
    if (prefilledRef.current || !place) {
      return;
    }

    setName(place.name);
    setLocation({ latitude: place.latitude, longitude: place.longitude });
    setRadiusFt(metersToFeet(place.radiusM));
    setInitialRegion({
      latitude: place.latitude,
      longitude: place.longitude,
      latitudeDelta: MAP_INITIAL_DELTA,
      longitudeDelta: MAP_INITIAL_DELTA,
    });
    prefilledRef.current = true;
  }, [place]);

  const handleSearch = async () => {
    const trimmedAddress = addressQuery.trim();

    if (!trimmedAddress) {
      return;
    }

    const { location: matchedLocation } = await geocodeAddress(
      trimmedAddress,
    );

    if (!matchedLocation) {
      return;
    }

    setLocation(matchedLocation);
    setConfirmedAddress(trimmedAddress);
    setAddressQuery('');
    setFormErrorMessage(null);

    // MapLocationPicker only reads initialRegion once, on mount — updating
    // it here (paired with the key below) forces a remount so the picker
    // actually recenters on the searched address, instead of silently
    // updating location while the visible map stays put. Panning-driven
    // updates (handlePickerConfirm) must NOT do this, or the map would jump
    // back to its seed position on every pan-settle.
    setInitialRegion({
      latitude: matchedLocation.latitude,
      longitude: matchedLocation.longitude,
      latitudeDelta: MAP_INITIAL_DELTA,
      longitudeDelta: MAP_INITIAL_DELTA,
    });
  };

  const handlePickerConfirm = (result: MapLocationPickerResult) => {
    setLocation({ latitude: result.latitude, longitude: result.longitude });
    setConfirmedAddress(result.address);
    setFormErrorMessage(null);
  };

  const trimmedName = name.trim();

  const handleSave = async () => {
    if (!trimmedName) {
      setFormErrorMessage(NAME_EMPTY_MESSAGE);
      return;
    }

    if (!location || !placeId) {
      return;
    }

    setFormErrorMessage(null);

    const { error } = await updateGeofence(placeId, {
      name: trimmedName,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusM: feetToMeters(radiusFt),
    });

    if (!error) {
      router.back();
    }
  };

  const handleDelete = async () => {
    if (!placeId) {
      return;
    }

    const { error } = await deleteGeofence(placeId);

    if (!error) {
      router.back();
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete zone?',
      `"${place?.name ?? 'This zone'}" will be removed for everyone in this group.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
      ],
    );
  };

  if (geofencesLoading && !place) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!geofencesLoading && !place) {
    return (
      <View style={styles.center}>
        <Text style={styles.messageText}>This zone no longer exists.</Text>
      </View>
    );
  }

  if (!initialRegion || !place) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!canManage) {
    return (
      <View style={styles.container}>
        <Text style={styles.readOnlyName}>{place.name}</Text>
        <Text style={styles.readOnlyDetail}>
          Radius: {Math.round(metersToFeet(place.radiusM))} ft
        </Text>
        <Text style={styles.readOnlyDetail}>
          Location: {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
        </Text>
        <Text style={styles.readOnlyHint}>
          Only this zone's creator or the group owner can edit it.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pickerContainer}>
          <MapLocationPicker
            key={`${initialRegion.latitude}-${initialRegion.longitude}`}
            mode="inline"
            initialRegion={initialRegion}
            radiusM={feetToMeters(radiusFt)}
            onConfirm={handlePickerConfirm}
          />
        </View>

        <View style={styles.radiusSection}>
          <Text style={styles.radiusLabel}>
            Radius: {Math.round(radiusFt)} ft
          </Text>
          <Slider
            minimumValue={RADIUS_MIN_FT}
            maximumValue={RADIUS_MAX_FT}
            value={radiusFt}
            onValueChange={setRadiusFt}
            minimumTrackTintColor="#2563eb"
          />
        </View>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Zone name"
          editable={!updating}
        />

        <View style={styles.searchRow}>
          <TextInput
            style={[styles.input, styles.searchInput]}
            value={addressQuery}
            onChangeText={setAddressQuery}
            placeholder="Search an address"
            editable={!geocoding}
          />
          <Pressable
            style={[
              styles.searchButton,
              geocoding && styles.buttonDisabled,
            ]}
            onPress={handleSearch}
            disabled={geocoding}
          >
            {geocoding ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </Pressable>
        </View>

        {geocodeErrorMessage ? (
          <Text style={styles.error}>{geocodeErrorMessage}</Text>
        ) : null}

        {location ? (
          <Text style={styles.locationConfirmed}>
            Location set{confirmedAddress ? `: ${confirmedAddress}` : '.'}
          </Text>
        ) : null}

        {formErrorMessage ? (
          <Text style={styles.error}>{formErrorMessage}</Text>
        ) : null}
        {updateErrorMessage ? (
          <Text style={styles.error}>{updateErrorMessage}</Text>
        ) : null}

        <View style={styles.actionsRow}>
          <Pressable
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[
              styles.saveButton,
              updating && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </Pressable>
        </View>

        {deleteErrorMessage ? (
          <Text style={styles.error}>{deleteErrorMessage}</Text>
        ) : null}

        {deleting ? (
          <ActivityIndicator />
        ) : (
          <Pressable style={styles.deleteButton} onPress={confirmDelete}>
            <Text style={styles.deleteButtonText}>Delete Zone</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  messageText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  pickerContainer: {
    height: 320,
    borderRadius: 8,
    overflow: 'hidden',
  },
  radiusSection: {
    gap: 4,
  },
  radiusLabel: {
    fontSize: 15,
    color: '#222',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
  },
  searchButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  locationConfirmed: {
    fontSize: 14,
    color: '#2e7d32',
  },
  error: {
    color: '#c0392b',
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#222',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#c0392b',
    fontSize: 15,
    fontWeight: '600',
  },
  readOnlyName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
  },
  readOnlyDetail: {
    fontSize: 15,
    color: '#444',
  },
  readOnlyHint: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
});
