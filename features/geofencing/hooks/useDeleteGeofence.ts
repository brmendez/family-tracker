// features/geofencing/hooks/useDeleteGeofence.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';

type UseDeleteGeofenceResult = {
  deleteGeofence: (geofenceId: string) => Promise<{ error: string | null }>;
  deleting: boolean;
  deleteErrorMessage: string | null;
};

const GENERIC_FAILURE_MESSAGE = 'Could not delete this zone. Please try again.';

/**
 * FT-14: mirrors useLeaveGroup's shape. Plain delete — RLS
 * (geofences_delete_creator_or_owner) rejects it server-side for anyone
 * but the creator or the group owner.
 */
export const useDeleteGeofence = (): UseDeleteGeofenceResult => {
  const [deleting, setDeleting] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(
    null,
  );

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const deleteGeofence = useCallback(
    async (geofenceId: string): Promise<{ error: string | null }> => {
      setDeleting(true);
      setDeleteErrorMessage(null);

      const { error } = await supabase
        .from('geofences')
        .delete()
        .eq('id', geofenceId);

      if (!isMountedRef.current) {
        return { error: error?.message ?? null };
      }

      setDeleting(false);

      if (error) {
        setDeleteErrorMessage(GENERIC_FAILURE_MESSAGE);
        return { error: GENERIC_FAILURE_MESSAGE };
      }

      return { error: null };
    },
    [],
  );

  return { deleteGeofence, deleting, deleteErrorMessage };
};
