// features/map/hooks/useGroupMemberLocations.ts
import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimePostgresInsertPayload,
} from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';

import { supabase } from '../../../lib/supabase';

export type OtherUserLocation = {
  latitude: number;
  longitude: number;
  recordedAt: string; // ISO string, from recorded_at
  speedMps: number | null;
  headingDeg: number | null;
};

type UseGroupMemberLocationsResult = {
  locations: Record<string, OtherUserLocation>;
  loading: boolean;
  errorMessage: string | null;
};

type LocationHistoryRow = {
  user_id: string;
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

const toLatestByUser = (
  rows: LocationHistoryRow[],
): Record<string, OtherUserLocation> => {
  const latest: Record<string, OtherUserLocation> = {};

  for (const row of rows) {
    const existing = latest[row.user_id];
    const location = toOtherUserLocation(row);

    if (!existing || location.recordedAt > existing.recordedAt) {
      latest[row.user_id] = location;
    }
  }

  return latest;
};

// Fetches each member's latest location, then subscribes to one unfiltered
// realtime channel — RLS already scopes which INSERTs arrive, so events
// for ids outside memberIds are just ignored client-side.
export const useGroupMemberLocations = (
  memberIds: string[],
): UseGroupMemberLocationsResult => {
  const [locations, setLocations] = useState<Record<string, OtherUserLocation>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Effects should key off memberIds by content, not array reference — a
  // caller re-creating the array on every render (even with equal content)
  // must not retrigger the fetch/resubscribe below.
  const memberIdsKey = useMemo(() => memberIds.join(','), [memberIds]);

  useEffect(() => {
    if (memberIds.length === 0) {
      setLocations((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setLoading((prev) => (prev === false ? prev : false));
      setErrorMessage((prev) => (prev === null ? prev : null));
      return;
    }

    let isCancelled = false;
    setLoading(true);

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from('location_history')
        .select('user_id, latitude, longitude, recorded_at, speed_mps, heading_deg')
        .in('user_id', memberIds)
        .order('recorded_at', { ascending: false });

      if (isCancelled) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      setLocations(toLatestByUser(data ?? []));
      setErrorMessage(null);
      setLoading(false);
    };

    fetchLatest();

    const channel = supabase
      .channel('location_history:active_group')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'location_history' },
        (payload: RealtimePostgresInsertPayload<LocationHistoryRow>) => {
          if (isCancelled || !memberIds.includes(payload.new.user_id)) {
            return;
          }

          setLocations((prev) => ({
            ...prev,
            [payload.new.user_id]: toOtherUserLocation(payload.new),
          }));
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
    // memberIdsKey (content) is the real dependency; memberIds itself is
    // read fresh from this render's closure, not from the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberIdsKey]);

  return { locations, loading, errorMessage };
};
