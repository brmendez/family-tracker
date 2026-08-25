// features/geofencing/hooks/useUpdateGeofence.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';

type UpdateGeofenceInput = {
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
};

type UseUpdateGeofenceResult = {
  updateGeofence: (
    geofenceId: string,
    input: UpdateGeofenceInput,
  ) => Promise<{ error: string | null }>;
  updating: boolean;
  updateErrorMessage: string | null;
};

/**
 * FT-14: plain update on the four columns geofences_update_creator_or_owner
 * grants (name, latitude, longitude, radius_m) — RLS rejects the write
 * outright for anyone else, no client-side role check required here.
 */
export const useUpdateGeofence = (): UseUpdateGeofenceResult => {
  const [updating, setUpdating] = useState(false);
  const [updateErrorMessage, setUpdateErrorMessage] = useState<string | null>(
    null,
  );

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateGeofence = useCallback(
    async (
      geofenceId: string,
      input: UpdateGeofenceInput,
    ): Promise<{ error: string | null }> => {
      setUpdating(true);
      setUpdateErrorMessage(null);

      const { error } = await supabase
        .from('geofences')
        .update({
          name: input.name,
          latitude: input.latitude,
          longitude: input.longitude,
          radius_m: input.radiusM,
        })
        .eq('id', geofenceId);

      if (!isMountedRef.current) {
        return { error: error?.message ?? null };
      }

      setUpdating(false);

      if (error) {
        setUpdateErrorMessage(error.message);
        return { error: error.message };
      }

      return { error: null };
    },
    [],
  );

  return { updateGeofence, updating, updateErrorMessage };
};
