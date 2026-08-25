// features/geofencing/hooks/useGeofences.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import type { Geofence } from '../types/geofence.types';

type UseGeofencesResult = {
  geofences: Geofence[];
  loading: boolean;
  errorMessage: string | null;
  refetch: () => Promise<void>;
};

type GeofenceRow = {
  id: string;
  group_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  created_by: string | null;
  created_at: string;
};

const toGeofence = (row: GeofenceRow): Geofence => ({
  id: row.id,
  groupId: row.group_id,
  name: row.name,
  latitude: row.latitude,
  longitude: row.longitude,
  radiusM: row.radius_m,
  createdBy: row.created_by,
  createdAt: row.created_at,
});

/** Fetches a group's zones; RLS already scopes to membership. */
export const useGeofences = (groupId: string | undefined): UseGeofencesResult => {
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchGeofences = useCallback(async () => {
    if (!groupId) {
      setGeofences([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('geofences')
      .select('id, group_id, name, latitude, longitude, radius_m, created_by, created_at')
      .eq('group_id', groupId);

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as GeofenceRow[];

    setGeofences(rows.map(toGeofence));
    setErrorMessage(null);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    fetchGeofences();
  }, [fetchGeofences]);

  return { geofences, loading, errorMessage, refetch: fetchGeofences };
};
