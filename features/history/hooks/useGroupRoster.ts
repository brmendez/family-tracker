// features/history/hooks/useGroupRoster.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase';

export type GroupRosterMember = {
  id: string;
  displayName: string;
  avatarColor: string | null;
};

type UseGroupRosterResult = {
  members: GroupRosterMember[];
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

const toGroupRosterMember = (row: GroupMemberRow): GroupRosterMember | null => {
  if (!row.profiles) {
    return null;
  }

  return {
    id: row.profiles.id,
    displayName: row.profiles.display_name,
    avatarColor: row.profiles.avatar_color,
  };
};

// Every *current* member of activeGroupId, self included, unfiltered by
// hide state. Deliberately not useActiveGroupMembers — that hook excludes
// hidden members (FT-38), which would silently narrow "any group member"
// (decision #7); redaction by hide-state is FT-23's job, not this one's.
export const useGroupRoster = (
  activeGroupId: string | null,
): UseGroupRosterResult => {
  const [members, setMembers] = useState<GroupRosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchRoster = useCallback(async () => {
    if (!activeGroupId) {
      setMembers([]);
      setErrorMessage(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('group_members')
      .select('profiles(id, display_name, avatar_color)')
      .eq('group_id', activeGroupId);

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
      .map(toGroupRosterMember)
      .filter((member): member is GroupRosterMember => member !== null);

    setMembers(nextMembers);
    setErrorMessage(null);
    setLoading(false);
  }, [activeGroupId]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  return { members, loading, errorMessage };
};
