// features/history/hooks/useJourneyHistory.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import { JOURNEY_HISTORY_PAGE_ROW_LIMIT } from '../../../lib/constants';
import { groupLocationHistoryByDay } from '../lib/groupLocationHistoryByDay';
import type { JourneyDay, LocationHistoryPoint } from '../types/history.types';

type UseJourneyHistoryResult = {
  days: JourneyDay[];
  loading: boolean;
  loadingMore: boolean;
  errorMessage: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
};

type LocationHistoryRow = {
  id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  speed_mps: number | null;
  heading_deg: number | null;
};

const SELECT_COLUMNS = 'id, latitude, longitude, recorded_at, speed_mps, heading_deg';

const toLocationHistoryPoint = (row: LocationHistoryRow): LocationHistoryPoint => ({
  id: row.id,
  latitude: row.latitude,
  longitude: row.longitude,
  recordedAt: row.recorded_at,
  speedMps: row.speed_mps,
  headingDeg: row.heading_deg,
});

// Keyset-paginated fetch of a member's full location_history, most recent
// first. Cursors on (recorded_at, id) rather than offset/page-number — see
// ARCHITECTURE.md "Pagination shape" for why (future jump-to-date reuses
// this same cursor path).
export const useJourneyHistory = (memberId: string | null): UseJourneyHistoryResult => {
  const [points, setPoints] = useState<LocationHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchInitialPage = useCallback(async () => {
    if (!memberId) {
      setPoints([]);
      setHasMore(false);
      setErrorMessage(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('location_history')
      .select(SELECT_COLUMNS)
      .eq('user_id', memberId)
      .order('recorded_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(JOURNEY_HISTORY_PAGE_ROW_LIMIT);

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      setErrorMessage(error.message);
      setPoints([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as LocationHistoryRow[];

    setPoints(rows.map(toLocationHistoryPoint));
    setHasMore(rows.length === JOURNEY_HISTORY_PAGE_ROW_LIMIT);
    setErrorMessage(null);
    setLoading(false);
  }, [memberId]);

  // Resets fully on memberId change — fetchInitialPage replaces (not
  // appends to) points.
  useEffect(() => {
    fetchInitialPage();
  }, [fetchInitialPage]);

  const loadMore = useCallback(async () => {
    if (!memberId || loading || loadingMore || !hasMore || points.length === 0) {
      return;
    }

    const oldest = points[points.length - 1];

    setLoadingMore(true);

    // Strictly-older-than cursor, with an id tie-break for FT-5's known
    // same-instant-duplicate quirk (two rows sharing one recorded_at).
    const { data, error } = await supabase
      .from('location_history')
      .select(SELECT_COLUMNS)
      .eq('user_id', memberId)
      .or(
        `recorded_at.lt.${oldest.recordedAt},and(recorded_at.eq.${oldest.recordedAt},id.lt.${oldest.id})`,
      )
      .order('recorded_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(JOURNEY_HISTORY_PAGE_ROW_LIMIT);

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      setErrorMessage(error.message);
      setLoadingMore(false);
      return;
    }

    const rows = (data ?? []) as LocationHistoryRow[];

    setPoints((prev) => [...prev, ...rows.map(toLocationHistoryPoint)]);
    setHasMore(rows.length === JOURNEY_HISTORY_PAGE_ROW_LIMIT);
    setErrorMessage(null);
    setLoadingMore(false);
  }, [memberId, loading, loadingMore, hasMore, points]);

  // Pure regroup on every points change — a page landing mid-day merges
  // into that day's existing bucket for free, no special-case needed.
  const days = useMemo(() => groupLocationHistoryByDay(points), [points]);

  return { days, loading, loadingMore, errorMessage, hasMore, loadMore };
};
