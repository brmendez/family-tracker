// features/visibility/hooks/useGroupVisibility.ts
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';
import type { GroupVisibilityState } from '../types/visibility.types';

type UseGroupVisibilityResult = {
  state: GroupVisibilityState;
  loading: boolean;
  refetch: () => Promise<void>;
};

type OverrideRow = {
  event_type: 'hide' | 'unhide';
  expires_at: string | null;
};

const VISIBLE_STATE: GroupVisibilityState = { isHidden: false, expiresAt: null };

// Same predicate as is_hidden_from_group (0014) — small, acceptable
// duplication of one boolean check on a row already fetched for our own id.
const toVisibilityState = (row: OverrideRow | null): GroupVisibilityState => {
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

// Fetches the caller's own latest hide/unhide row for the active group
// (RLS-scoped by group_visibility_overrides_select_own). Refetches on
// screen focus, mirroring useActiveGroupMembers.
export const useGroupVisibility = (
  activeGroupId: string | null,
): UseGroupVisibilityResult => {
  const { userId } = useAuth();
  const [state, setState] = useState<GroupVisibilityState>(VISIBLE_STATE);
  const [loading, setLoading] = useState(true);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchState = useCallback(async () => {
    if (!activeGroupId || !userId) {
      setState(VISIBLE_STATE);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('group_visibility_overrides')
      .select('event_type, expires_at')
      .eq('group_id', activeGroupId)
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
  }, [activeGroupId, userId]);

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
