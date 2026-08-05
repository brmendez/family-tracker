// features/map/hooks/useOtherUserLocation.ts
import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimePostgresInsertPayload,
} from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '../../../lib/supabase';

// Given a user_id, fetches their most recent location_history row, then
// subscribes to postgres_changes INSERT events on location_history
// filtered to that user_id, updating state on every new fix. Re-runs the
// initial fetch every time the channel (re)enters the SUBSCRIBED state —
// not just on first mount — so a dropped/restored connection re-syncs to
// the true latest fix (postgres_changes does not backfill missed events
// on reconnect). No-ops while otherUserId is null. Removes the channel on
// unmount or when otherUserId changes, mirroring
// useForegroundLocation's cleanup pattern.
export type OtherUserLocation = {
  latitude: number;
  longitude: number;
  recordedAt: string; // ISO string, from recorded_at
  speedMps: number | null;
  headingDeg: number | null;
};

type UseOtherUserLocationResult = {
  location: OtherUserLocation | null;
  loading: boolean;
  errorMessage: string | null;
};

type LocationHistoryRow = {
  latitude: number;
  longitude: number;
  recorded_at: string;
  speed_mps: number | null;
  heading_deg: number | null;
};

const toOtherUserLocation = (row: LocationHistoryRow): OtherUserLocation => ({
  latitude: row.latitude,
  longitude: row.longitude,
  recordedAt: row.recorded_at,
  speedMps: row.speed_mps,
  headingDeg: row.heading_deg,
});

export const useOtherUserLocation = (
  otherUserId: string | null,
): UseOtherUserLocationResult => {
  const [location, setLocation] = useState<OtherUserLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!otherUserId) {
      setLocation(null);
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    let isCancelled = false;
    setLoading(true);

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from('location_history')
        .select('latitude, longitude, recorded_at, speed_mps, heading_deg')
        .eq('user_id', otherUserId)
        .order('recorded_at', { ascending: false })
        .limit(1);

      if (isCancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      const row = data[0] ?? null;

      if (row) {
        setLocation(toOtherUserLocation(row));
      }

      setErrorMessage(null);
      setLoading(false);
    };

    fetchLatest();

    const channel = supabase
      .channel(`location_history:${otherUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'location_history',
          filter: `user_id=eq.${otherUserId}`,
        },
        (payload: RealtimePostgresInsertPayload<LocationHistoryRow>) => {
          if (isCancelled) {
            return;
          }

          setLocation(toOtherUserLocation(payload.new));
        },
      )
      .subscribe((status) => {
        if (isCancelled) {
          return;
        }

        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          fetchLatest();
        }
      });

    return () => {
      isCancelled = true;
      supabase.removeChannel(channel);
    };
  }, [otherUserId]);

  return { location, loading, errorMessage };
};
