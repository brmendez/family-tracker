// features/geofencing/components/AddPlaceScreen.tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useGroupsContext } from '../../../context/groups.context';
import { MAP_INITIAL_DELTA } from '../../../lib/constants';
import { useForegroundLocation } from '../../map/hooks/useForegroundLocation';
import { useCreateGeofence } from '../hooks/useCreateGeofence';
import {
  useGeocodeAddress,
  type GeocodedLocation,
} from '../hooks/useGeocodeAddress';
import {
  MapLocationPicker,
  type MapLocationPickerResult,
} from './MapLocationPicker';
import { feetToMeters, RADIUS_DEFAULT_FT } from '../radius';

const NAME_EMPTY_MESSAGE = "Zone name can't be empty.";
const MISSING_LOCATION_MESSAGE =
  'Search an address or use Select on Map to set a location.';
const MISSING_GROUP_MESSAGE = 'No active group — cannot add a zone.';

/**
 * FT-14 redesign, piece 2/3: address-based or map-based Add Place. Radius is
 * not adjustable at creation, always defaults to RADIUS_DEFAULT_FT.
 */
export const AddPlaceScreen = () => {
  const router = useRouter();
  const { activeGroupId } = useGroupsContext();
  const { createGeofence, creating, createErrorMessage } = useCreateGeofence();
  const { geocodeAddress, geocoding, geocodeErrorMessage } =
    useGeocodeAddress();
  const { coords } = useForegroundLocation();

  const [name, setName] = useState('');
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [location, setLocation] = useState<GeocodedLocation | null>(null);
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(
    null,
  );

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
    setFormErrorMessage(null);

    if (!nameManuallyEdited) {
      setName(trimmedAddress);
    }
  };

  const handleNameChange = (text: string) => {
    setName(text);
    setNameManuallyEdited(true);
  };

  const handleSelectOnMap = () => {
    if (!coords) {
      return;
    }

    setPickerOpen(true);
  };

  const handlePickerConfirm = (result: MapLocationPickerResult) => {
    setLocation({ latitude: result.latitude, longitude: result.longitude });
    setConfirmedAddress(result.address);
    setAddressQuery('');
    setFormErrorMessage(null);
    setPickerOpen(false);

    if (!nameManuallyEdited && result.address) {
      setName(result.address);
    }
  };

  const handlePickerCancel = () => {
    setPickerOpen(false);
  };

  const trimmedName = name.trim();

  const handleSave = async () => {
    if (!trimmedName) {
      setFormErrorMessage(NAME_EMPTY_MESSAGE);
      return;
    }

    if (!location) {
      setFormErrorMessage(MISSING_LOCATION_MESSAGE);
      return;
    }

    if (!activeGroupId) {
      setFormErrorMessage(MISSING_GROUP_MESSAGE);
      return;
    }

    setFormErrorMessage(null);

    const { error } = await createGeofence({
      groupId: activeGroupId,
      name: trimmedName,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusM: feetToMeters(RADIUS_DEFAULT_FT),
    });

    if (!error) {
      router.back();
    }
  };

  return (
    <>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <View style={styles.content}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={handleNameChange}
            placeholder="Zone name"
            editable={!creating}
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

          <Pressable style={styles.selectOnMapRow} onPress={handleSelectOnMap}>
            <Text style={styles.selectOnMapText}>Select on Map</Text>
          </Pressable>

          {formErrorMessage ? (
            <Text style={styles.error}>{formErrorMessage}</Text>
          ) : null}
          {createErrorMessage ? (
            <Text style={styles.error}>{createErrorMessage}</Text>
          ) : null}

          <Pressable
            style={[
              styles.saveButton,
              (creating || !location) && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            disabled={creating || !location}
          >
            {creating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Add Zone</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={pickerOpen && Boolean(coords)}
        animationType="slide"
        onRequestClose={handlePickerCancel}
      >
        {coords ? (
          <MapLocationPicker
            mode="modal"
            initialRegion={{
              latitude: coords.latitude,
              longitude: coords.longitude,
              latitudeDelta: MAP_INITIAL_DELTA,
              longitudeDelta: MAP_INITIAL_DELTA,
            }}
            radiusM={feetToMeters(RADIUS_DEFAULT_FT)}
            onConfirm={handlePickerConfirm}
            onCancel={handlePickerCancel}
          />
        ) : null}
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    gap: 16,
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
  selectOnMapRow: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  selectOnMapText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563eb',
  },
  error: {
    color: '#c0392b',
    fontSize: 14,
  },
  saveButton: {
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
});
