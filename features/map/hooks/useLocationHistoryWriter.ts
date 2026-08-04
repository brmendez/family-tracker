// features/map/hooks/useLocationHistoryWriter.ts
import type * as Location from 'expo-location';
import { useEffect } from 'react';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';

// Writes each foreground GPS fix to location_history (append-only, per
// ARCHITECTURE.md — v5/v6 depend on a full history, not a "latest
// location" row). Does not watch GPS itself: takes the coords/timestamp
// already produced by useForegroundLocation so there is only ever one
// watchPositionAsync subscription for the map screen.
//
// Insert failures are logged and swallowed rather than surfaced or
// retried — the map must keep working even if a write occasionally
// fails (e.g. a network hiccup). Retry/offline-queue handling is
// explicitly out of scope for FT-5.
export const useLocationHistoryWriter = (
  coords: Location.LocationObjectCoords | null,
  timestamp: number | null,
): void => {
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId || !coords || !timestamp) {
      return;
    }

    // iOS/CoreLocation returns -1 (not null) for speed/heading when they
    // can't be determined — normalize that sentinel to null so it isn't
    // mistaken for real data (e.g. "moving backwards") by v6's speed
    // detection later.
    const speedMps = coords.speed !== null && coords.speed >= 0 ? coords.speed : null;
    const headingDeg = coords.heading !== null && coords.heading >= 0 ? coords.heading : null;

    const writeFix = async () => {
      const { error } = await supabase.from('location_history').insert({
        user_id: userId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        recorded_at: new Date(timestamp).toISOString(),
        accuracy: coords.accuracy,
        speed_mps: speedMps,
        heading_deg: headingDeg,
      });

      if (error) {
        console.warn('[location-history] insert failed:', error.message);
      }
    };

    writeFix();
  }, [userId, coords, timestamp]);
};
