// features/visibility/hooks/useGlobalVisibility.ts
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';
import type { GlobalVisibilityState } from '../types/visibility.types';

type UseGlobalVisibilityResult = {
  state: GlobalVisibilityState;
  loading: boolean;
  refetch: () => Promise<void>;
};

type OverrideRow = {
  event_type: 'hide' | 'unhide';
  expires_at: string | null;
};

const VISIBLE_STATE: GlobalVisibilityState = { isHidden: false, expiresAt: null };

// Same predicate as is_globally_hidden (0018) — small, acceptable
// duplication of one boolean check on a row already fetched for our own id.
const toVisibilityState = (row: OverrideRow | null): GlobalVisibilityState => {
  if (!row || row.event_type === 'unhide') {
    return VISIBLE_STATE;
  }

  const isCurrentlyHidden =
    row.expires_at === null || new Date(row.expires_at) > new Date();

  if (!isCurrentlyHidden) {
    return VISIBLE_STATE;
  }

  return { isHidden: true, expiresAt: row.expires_at };
};

// Mirrors useGroupVisibility, minus the group filter — fetches the
// caller's own latest global hide/unhide row (RLS-scoped by
// global_visibility_overrides_select_own). Refetches on screen focus.
export const useGlobalVisibility = (): UseGlobalVisibilityResult => {
  const { userId } = useAuth();
  const [state, setState] = useState<GlobalVisibilityState>(VISIBLE_STATE);
  const [loading, setLoading] = useState(true);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchState = useCallback(async () => {
    if (!userId) {
      setState(VISIBLE_STATE);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('global_visibility_overrides')
      .select('event_type, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      setState(VISIBLE_STATE);
      setLoading(false);
      return;
    }

    setState(toVisibilityState(data as OverrideRow | null));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useFocusEffect(
    useCallback(() => {
      fetchState();
    }, [fetchState]),
  );

  return { state, loading, refetch: fetchState };
};
