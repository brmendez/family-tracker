// features/visibility/hooks/useSetGlobalVisibility.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';
import type { VisibilityDuration } from '../types/visibility.types';

// 'unhide' isn't a VisibilityDuration (there's no hide length attached to
// it) but shares the same one RPC write path, same convention as
// useSetGroupVisibility's VisibilityAction.
type VisibilityAction = VisibilityDuration | 'unhide';

type UseSetGlobalVisibilityResult = {
  setVisibility: (action: VisibilityAction) => Promise<{ error: string | null }>;
  setting: boolean;
  setErrorMessage: string | null;
};

type SetGlobalVisibilityRpcParams = {
  p_hidden: boolean;
  p_duration_minutes: number | null;
  p_timezone: string | null;
};

const DURATION_MINUTES: Record<'1h' | '2h' | '4h', number> = {
  '1h': 60,
  '2h': 120,
  '4h': 240,
};

const toRpcParams = (action: VisibilityAction): SetGlobalVisibilityRpcParams => {
  if (action === 'unhide') {
    return { p_hidden: false, p_duration_minutes: null, p_timezone: null };
  }

  if (action === 'indefinite') {
    return { p_hidden: true, p_duration_minutes: null, p_timezone: null };
  }

  if (action === 'allDay') {
    return {
      p_hidden: true,
      p_duration_minutes: null,
      p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  return { p_hidden: true, p_duration_minutes: DURATION_MINUTES[action], p_timezone: null };
};

// Mirrors useSetGroupVisibility, minus group scoping — set_global_visibility
// (0019) takes no p_group_id. Same caller-supplied refetch pattern (state
// display and the write live in separate hooks).
export const useSetGlobalVisibility = (
  refetch: () => Promise<void>,
): UseSetGlobalVisibilityResult => {
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
    async (action: VisibilityAction): Promise<{ error: string | null }> => {
      setSetting(true);
      setSetErrorMessage(null);

      const { error } = await supabase.rpc('set_global_visibility', toRpcParams(action));

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
