// features/visibility/hooks/useSetGroupVisibility.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import type { VisibilityDuration } from '../types/visibility.types';

// 'unhide' isn't a VisibilityDuration (there's no hide length attached to
// it) but shares the same one RPC write path, per the ticket's mapping.
type VisibilityAction = VisibilityDuration | 'unhide';

type UseSetGroupVisibilityResult = {
  setVisibility: (
    groupId: string,
    action: VisibilityAction,
  ) => Promise<{ error: string | null }>;
  setting: boolean;
  setErrorMessage: string | null;
};

type SetGroupVisibilityRpcParams = {
  p_group_id: string;
  p_hidden: boolean;
  p_duration_minutes: number | null;
  p_timezone: string | null;
};

const DURATION_MINUTES: Record<'1h' | '2h' | '4h', number> = {
  '1h': 60,
  '2h': 120,
  '4h': 240,
};

const toRpcParams = (
  groupId: string,
  action: VisibilityAction,
): SetGroupVisibilityRpcParams => {
  if (action === 'unhide') {
    return { p_group_id: groupId, p_hidden: false, p_duration_minutes: null, p_timezone: null };
  }

  if (action === 'indefinite') {
    return { p_group_id: groupId, p_hidden: true, p_duration_minutes: null, p_timezone: null };
  }

  if (action === 'allDay') {
    return {
      p_group_id: groupId,
      p_hidden: true,
      p_duration_minutes: null,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  return {
    p_group_id: groupId,
    p_hidden: true,
    p_duration_minutes: DURATION_MINUTES[action],
    p_timezone: null,
  };
};

/**
 * FT-20: mirrors useCreateGeofence's shape, plus a caller-supplied refetch
 * (useGroupVisibility's) since state display and the write live in
 * separate hooks — calls it on success so the toggle updates immediately.
 */
export const useSetGroupVisibility = (
  refetch: () => Promise<void>,
): UseSetGroupVisibilityResult => {
  const [setting, setSetting] = useState(false);
  const [setErrorMessage, setSetErrorMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setVisibility = useCallback(
    async (
      groupId: string,
      action: VisibilityAction,
    ): Promise<{ error: string | null }> => {
      setSetting(true);
      setSetErrorMessage(null);

      const { error } = await supabase.rpc(
        'set_group_visibility',
        toRpcParams(groupId, action),
      );

      if (!isMountedRef.current) {
        return { error: error?.message ?? null };
      }

      setSetting(false);

      if (error) {
        setSetErrorMessage(error.message);
        return { error: error.message };
      }

      await refetch();

      return { error: null };
    },
    [refetch],
  );

  return { setVisibility, setting, setErrorMessage };
};
