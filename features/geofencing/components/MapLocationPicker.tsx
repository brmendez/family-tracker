// features/geofencing/components/MapLocationPicker.tsx
import { useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReverseGeocode } from '../hooks/useReverseGeocode';

// 1 degree of latitude is ~constant everywhere (~111,320m); no
// longitude/cos-latitude correction needed — locked by PO, see FT-14 detail.
const METERS_PER_LATITUDE_DEGREE = 111320;

// The circle View is laid out once at this fixed diameter and resized via
// `transform: scale` on every region change instead of changing its actual
// width/height/borderRadius — those are layout properties, and recomputing
// layout every frame during a pinch-zoom (which continuously changes
// latitudeDelta, and so the target pixel radius) is what caused visible
// jank. A transform is handled natively without a layout pass.
const BASE_CIRCLE_DIAMETER = 200;
const BASE_CIRCLE_RADIUS = BASE_CIRCLE_DIAMETER / 2;

export type MapLocationPickerResult = {
  latitude: number;
  longitude: number;
  address: string | null;
};

type MapLocationPickerProps = {
  initialRegion: Region;
  radiusM: number;
  mode: 'modal' | 'inline';
  onConfirm: (result: MapLocationPickerResult) => void;
  onCancel?: () => void;
};

/** Fixed-pin/live-circle/pan-to-select core; pin and circle are screen-space overlays, never map-bound. */
export const MapLocationPicker = ({
  initialRegion,
  radiusM,
  mode,
  onConfirm,
  onCancel,
}: MapLocationPickerProps) => {
  const [region, setRegion] = useState(initialRegion);
  const [mapHeightPx, setMapHeightPx] = useState(0);
  const lastRegionRef = useRef(initialRegion);
  const insets = useSafeAreaInsets();
  const { reverseGeocode, address, resolving } = useReverseGeocode();

  useEffect(() => {
    reverseGeocode(initialRegion);
    // Only for the picker's initial center's label — never confirms, so no
    // dependency on mode/onConfirm here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLayout = (event: LayoutChangeEvent) => {
    setMapHeightPx(event.nativeEvent.layout.height);
  };

  const handleRegionChange = (nextRegion: Region) => {
    setRegion(nextRegion);
  };

  // Inline mode has no "Next" button — onConfirm fires directly once this
  // specific pan's reverse-geocode resolves, rather than reactively off the
  // `address` state changing: two different pans can resolve to the exact
  // same formatted address (e.g. repositioning within the same block), and
  // React skips re-running a state-keyed effect when the new value is
  // equal to the old one, which would silently drop the second pan.
  const handleRegionChangeComplete = async (nextRegion: Region) => {
    lastRegionRef.current = nextRegion;

    const resolvedAddress = await reverseGeocode(nextRegion);

    if (mode === 'inline' && nextRegion === lastRegionRef.current) {
      onConfirm({
        latitude: nextRegion.latitude,
        longitude: nextRegion.longitude,
        address: resolvedAddress,
      });
    }
  };

  const handleConfirm = () => {
    const { latitude, longitude } = lastRegionRef.current;

    onConfirm({ latitude, longitude, address });
  };

  const metersPerPixel =
    mapHeightPx > 0
      ? (region.latitudeDelta * METERS_PER_LATITUDE_DEGREE) / mapHeightPx
      : 0;
  const pixelRadius = metersPerPixel > 0 ? radiusM / metersPerPixel : 0;

  return (
    <View style={styles.container}>
      {mode === 'modal' ? (
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleConfirm} hitSlop={8}>
            <Text style={styles.headerAction}>Next</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.mapContainer} onLayout={handleLayout}>
        <MapView
          style={styles.map}
          initialRegion={initialRegion}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
        />

        <View pointerEvents="none" style={styles.centerOverlay}>
          {pixelRadius > 0 ? (
            <View
              style={[
                styles.radiusCircle,
                {
                  transform: [{ scale: pixelRadius / BASE_CIRCLE_RADIUS }],
                },
              ]}
            />
          ) : null}
          <View style={styles.pin} />
        </View>

        <View
          style={[styles.addressLabel, { bottom: insets.bottom + 16 }]}
          pointerEvents="none"
        >
          <Text style={styles.addressLabelText} numberOfLines={2}>
            {resolving ? 'Finding address…' : address ?? 'Unknown location'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerAction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  radiusCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: BASE_CIRCLE_DIAMETER,
    height: BASE_CIRCLE_DIAMETER,
    marginLeft: -BASE_CIRCLE_RADIUS,
    marginTop: -BASE_CIRCLE_RADIUS,
    borderRadius: BASE_CIRCLE_RADIUS,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.6)',
  },
  pin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 16,
    height: 16,
    borderRadius: 8,
    marginTop: -8,
    marginLeft: -8,
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#fff',
  },
  addressLabel: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  addressLabelText: {
    fontSize: 14,
    color: '#222',
    textAlign: 'center',
  },
});
