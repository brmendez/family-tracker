// features/history/components/PlaybackMap.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { JOURNEY_PLAYBACK_ANIMATION_DURATION_MS, MAP_INITIAL_DELTA } from '../../../lib/constants';
import type { PlaybackPoint } from '../types/history.types';

type PlaybackMapProps = {
  points: PlaybackPoint[];
};

type LatLng = { latitude: number; longitude: number };
type VisiblePoint = PlaybackPoint & LatLng;

const isVisible = (point: PlaybackPoint): point is VisiblePoint =>
  !point.isRedacted && point.latitude !== null && point.longitude !== null;

// Splits into one coordinate array per contiguous non-redacted run — a
// redacted point ends the current segment, producing the "visible gap"
// in the rendered route rather than one line drawn straight through it.
const toSegments = (points: PlaybackPoint[]): LatLng[][] => {
  const segments: LatLng[][] = [];
  let current: LatLng[] = [];

  for (const point of points) {
    if (!isVisible(point)) {
      if (current.length > 0) {
        segments.push(current);
      }
      current = [];
      continue;
    }

    current.push({ latitude: point.latitude, longitude: point.longitude });
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
};

const interpolate = (from: LatLng, to: LatLng, fraction: number): LatLng => ({
  latitude: from.latitude + (to.latitude - from.latitude) * fraction,
  longitude: from.longitude + (to.longitude - from.longitude) * fraction,
});

// Real elapsed time between visible points compressed into a fixed total
// duration — a redacted gap between two visible points is crossed quickly
// rather than lingering, no special-casing needed beyond this compression.
const positionAtFraction = (
  visiblePoints: VisiblePoint[],
  elapsedMsByIndex: number[],
  totalRealElapsedMs: number,
  fraction: number,
): LatLng => {
  if (visiblePoints.length === 1) {
    return visiblePoints[0];
  }

  const targetElapsedMs = fraction * totalRealElapsedMs;
  let segmentIndex = 0;

  while (
    segmentIndex < elapsedMsByIndex.length - 2 &&
    elapsedMsByIndex[segmentIndex + 1] < targetElapsedMs
  ) {
    segmentIndex += 1;
  }

  const segmentStartMs = elapsedMsByIndex[segmentIndex];
  const segmentEndMs = elapsedMsByIndex[segmentIndex + 1];
  const segmentDurationMs = segmentEndMs - segmentStartMs;
  const segmentFraction =
    segmentDurationMs === 0 ? 0 : (targetElapsedMs - segmentStartMs) / segmentDurationMs;

  return interpolate(visiblePoints[segmentIndex], visiblePoints[segmentIndex + 1], segmentFraction);
};

// Dedicated map for one static historical day — deliberately not FamilyMap
// (see ARCHITECTURE.md FT-23 "Client scope" for why). Play/Pause only, no
// scrubber/seek (out of scope).
export const PlaybackMap = ({ points }: PlaybackMapProps) => {
  const segments = useMemo(() => toSegments(points), [points]);
  const visiblePoints = useMemo(() => points.filter(isVisible), [points]);

  const elapsedMsByIndex = useMemo(() => {
    if (visiblePoints.length === 0) {
      return [];
    }

    const firstMs = new Date(visiblePoints[0].recordedAt).getTime();

    return visiblePoints.map((point) => new Date(point.recordedAt).getTime() - firstMs);
  }, [visiblePoints]);

  const totalRealElapsedMs = elapsedMsByIndex[elapsedMsByIndex.length - 1] ?? 0;

  const [playing, setPlaying] = useState(false);
  const [markerPosition, setMarkerPosition] = useState<LatLng | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  // Resets the marker to the day's start whenever the day itself changes.
  useEffect(() => {
    setPlaying(false);
    setMarkerPosition(visiblePoints[0] ?? null);
  }, [visiblePoints]);

  useEffect(() => {
    if (!playing || visiblePoints.length === 0) {
      return undefined;
    }

    startedAtRef.current = Date.now();

    const tick = () => {
      const elapsedAnimationMs = Date.now() - startedAtRef.current;
      const fraction = Math.min(1, elapsedAnimationMs / JOURNEY_PLAYBACK_ANIMATION_DURATION_MS);

      setMarkerPosition(
        positionAtFraction(visiblePoints, elapsedMsByIndex, totalRealElapsedMs, fraction),
      );

      if (fraction >= 1) {
        setPlaying(false);
        return;
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [playing, visiblePoints, elapsedMsByIndex, totalRealElapsedMs]);

  const initialRegion = visiblePoints[0]
    ? {
        latitude: visiblePoints[0].latitude,
        longitude: visiblePoints[0].longitude,
        latitudeDelta: MAP_INITIAL_DELTA,
        longitudeDelta: MAP_INITIAL_DELTA,
      }
    : undefined;

  const canPlay = visiblePoints.length > 1;

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={initialRegion}>
        {segments.map((segment, index) => (
          <Polyline
            key={`segment-${index}`}
            coordinates={segment}
            strokeColor="#2563eb"
            strokeWidth={4}
          />
        ))}
        {markerPosition ? (
          <Marker coordinate={markerPosition} accessibilityLabel="Route position" />
        ) : null}
      </MapView>
      <Pressable
        style={[styles.playButton, !canPlay ? styles.playButtonDisabled : null]}
        onPress={() => setPlaying((prev) => !prev)}
        disabled={!canPlay}
        accessibilityLabel={playing ? 'Pause' : 'Play'}
      >
        <Text style={styles.playButtonText}>{playing ? 'Pause' : 'Play'}</Text>
      </Pressable>
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
  playButton: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  playButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
