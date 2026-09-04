// features/history/hooks/useJourneyPlayback.ts
import { useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { deriveRedactedWindows } from '../lib/deriveRedactedWindows';
import type { PlaybackPoint, RedactedWindow } from '../types/history.types';

type UseJourneyPlaybackResult = {
  points: PlaybackPoint[];
  redactedWindows: RedactedWindow[];
  loading: boolean;
  errorMessage: string | null;
};

type PlaybackPointRow = {
  id: string;
  recorded_at: string;
  latitude: number | null;
  longitude: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  is_redacted: boolean;
};

const toPlaybackPoint = (row: PlaybackPointRow): PlaybackPoint => ({
  id: row.id,
  recordedAt: row.recorded_at,
  latitude: row.latitude,
  longitude: row.longitude,
  speedMps: row.speed_mps,
  headingDeg: row.heading_deg,
  isRedacted: row.is_redacted,
});

// One fixed-range fetch of a single calendar day via get_journey_playback_points
// — not paginated (a duplicate same-recorded_at instant just contributes a
// near-zero-duration animation step, see ARCHITECTURE.md edge case #8), so
// this resets fully on any param change rather than accumulating.
export const useJourneyPlayback = (
  memberId: string | null,
  groupId: string | null,
  dateLocal: string | null,
): UseJourneyPlaybackResult => {
  const [points, setPoints] = useState<PlaybackPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const fetchPlayback = async () => {
      if (!memberId || !groupId || !dateLocal) {
        setPoints([]);
        setErrorMessage(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error } = await supabase.rpc('get_journey_playback_points', {
        p_user_id: memberId,
        p_group_id: groupId,
        p_date_local: dateLocal,
        p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      if (!isMountedRef.current) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setPoints([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as PlaybackPointRow[];

      setPoints(rows.map(toPlaybackPoint));
      setErrorMessage(null);
      setLoading(false);
    };

    fetchPlayback();
  }, [memberId, groupId, dateLocal]);

  const redactedWindows = useMemo(() => deriveRedactedWindows(points), [points]);

  return { points, redactedWindows, loading, errorMessage };
};
