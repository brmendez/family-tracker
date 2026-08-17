// features/groups/hooks/useGroups.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';

export type Group = {
  id: string;
  name: string;
  role: 'owner' | 'member';
  joinedAt: string;
};

type UseGroupsResult = {
  groups: Group[];
  loading: boolean;
  errorMessage: string | null;
  createGroup: (name: string) => Promise<{ error: string | null }>;
  creating: boolean;
  createErrorMessage: string | null;
  refetch: () => Promise<void>;
};

type GroupMemberRow = {
  role: string;
  joined_at: string;
  groups: { id: string; name: string } | null;
};

const toGroup = (row: GroupMemberRow): Group | null => {
  if (!row.groups) {
    return null;
  }

  return {
    id: row.groups.id,
    name: row.groups.name,
    role: row.role === 'owner' ? 'owner' : 'member',
    joinedAt: row.joined_at,
  };
};

/**
 * FT-8: fetches the signed-in user's groups (group_members joined to
 * groups, filtered to their own membership rows) on mount and whenever
 * userId changes, giving { id, name, role, joinedAt } per group. role is
 * included even though nothing in FT-8 uses it yet — FT-9/FT-11 will.
 *
 * createGroup always goes through the create_group RPC (FT-7) — never a
 * raw insert, since groups/group_members have no client INSERT grant by
 * design. On a successful create, refetches the list rather than
 * hand-merging the new row into state. Fetch-error and create-error
 * state are tracked separately so a failed create never blanks out an
 * already-loaded list.
 */
export const useGroups = (): UseGroupsResult => {
  const { userId } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const fetchGroups = useCallback(async () => {
    if (!userId) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('group_members')
      .select('role, joined_at, groups(id, name)')
      .eq('user_id', userId);

    if (!isMountedRef.current) {
      return;
    }

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as GroupMemberRow[];
    const nextGroups = rows
      .map(toGroup)
      .filter((group): group is Group => group !== null);

    setGroups(nextGroups);
    setErrorMessage(null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const createGroup = useCallback(
    async (name: string): Promise<{ error: string | null }> => {
      setCreating(true);
      setCreateErrorMessage(null);

      const { error } = await supabase.rpc('create_group', { p_name: name });

      if (error) {
        if (isMountedRef.current) {
          setCreateErrorMessage(error.message);
          setCreating(false);
        }

        return { error: error.message };
      }

      await fetchGroups();

      if (isMountedRef.current) {
        setCreating(false);
      }

      return { error: null };
    },
    [fetchGroups],
  );

  return {
    groups,
    loading,
    errorMessage,
    createGroup,
    creating,
    createErrorMessage,
    refetch: fetchGroups,
  };
};
