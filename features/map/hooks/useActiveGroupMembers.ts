// features/map/hooks/useActiveGroupMembers.ts
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';

export type ActiveGroupMember = {
  id: string;
  displayName: string;
  avatarColor: string | null;
};

type UseActiveGroupMembersResult = {
  members: ActiveGroupMember[];
  loading: boolean;
  errorMessage: string | null;
};

type VisibleGroupMemberRow = {
  user_id: string;
  display_name: string;
  avatar_color: string | null;
};

const toActiveGroupMember = (row: VisibleGroupMemberRow): ActiveGroupMember => ({
  id: row.user_id,
  displayName: row.display_name,
  avatarColor: row.avatar_color,
});

// Fetches the active group's other members (excluding self). Refetches on
// screen focus since leave/join changes elsewhere aren't otherwise visible.
export const useActiveGroupMembers = (
  activeGroupId: string | null,
): UseActiveGroupMembersResult => {
  const { userId } = useAuth();
  const [members, setMembers] = useState<ActiveGroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!activeGroupId || !userId) {
      setMembers([]);
      setErrorMessage(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // FT-38: server-side, scoped to activeGroupId — excludes anyone hidden
    // from this group or globally, unlike a raw group_members join.
    const { data, error } = await supabase.rpc('get_visible_group_members', {
      p_group_id: activeGroupId,
    });

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      setErrorMessage(error.message);
      setMembers([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as VisibleGroupMemberRow[];
    const nextMembers = rows.map(toActiveGroupMember);

    setMembers(nextMembers);
    setErrorMessage(null);
    setLoading(false);
  }, [activeGroupId, userId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useFocusEffect(
    useCallback(() => {
      fetchMembers();
    }, [fetchMembers]),
  );

  return { members, loading, errorMessage };
};
