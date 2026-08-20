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

type GroupMemberRow = {
  profiles: {
    id: string;
    display_name: string;
    avatar_color: string | null;
  } | null;
};

const toActiveGroupMember = (row: GroupMemberRow): ActiveGroupMember | null => {
  if (!row.profiles) {
    return null;
  }

  return {
    id: row.profiles.id,
    displayName: row.profiles.display_name,
    avatarColor: row.profiles.avatar_color,
  };
};

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

    const { data, error } = await supabase
      .from('group_members')
      .select('profiles(id, display_name, avatar_color)')
      .eq('group_id', activeGroupId)
      .neq('user_id', userId);

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      setErrorMessage(error.message);
      setMembers([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as GroupMemberRow[];
    const nextMembers = rows
      .map(toActiveGroupMember)
      .filter((member): member is ActiveGroupMember => member !== null);

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
