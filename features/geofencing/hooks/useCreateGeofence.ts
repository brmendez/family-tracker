// features/geofencing/hooks/useCreateGeofence.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';

type CreateGeofenceInput = {
  groupId: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
};

type UseCreateGeofenceResult = {
  createGeofence: (input: CreateGeofenceInput) => Promise<{ error: string | null }>;
  creating: boolean;
  createErrorMessage: string | null;
};

/**
 * FT-14: plain insert (no RPC — geofences has a client insert grant, see
 * 0009_geofences.sql). created_by is set client-side to the caller's id,
 * required by the insert policy's with check.
 */
export const useCreateGeofence = (): UseCreateGeofenceResult => {
  const { userId } = useAuth();
  const [creating, setCreating] = useState(false);
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(
    null,
  );

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const createGeofence = useCallback(
    async (input: CreateGeofenceInput): Promise<{ error: string | null }> => {
      if (!userId) {
        return { error: 'Not signed in.' };
      }

      setCreating(true);
      setCreateErrorMessage(null);

      const { error } = await supabase.from('geofences').insert({
        group_id: input.groupId,
        name: input.name,
        latitude: input.latitude,
        longitude: input.longitude,
        radius_m: input.radiusM,
        created_by: userId,
      });

      if (!isMountedRef.current) {
        return { error: error?.message ?? null };
      }

      setCreating(false);

      if (error) {
        setCreateErrorMessage(error.message);
        return { error: error.message };
      }

      return { error: null };
    },
    [userId],
  );

  return { createGeofence, creating, createErrorMessage };
};
