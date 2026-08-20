// context/groups.context.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '../lib/supabase';
import { useAuth } from './auth.context';

const ACTIVE_GROUP_STORAGE_KEY = 'family-tracker/active-group-id';

export type MembershipGroup = {
  id: string;
  name: string;
  joinedAt: string;
};

type GroupsContextValue = {
  groups: MembershipGroup[];
  activeGroupId: string | null;
  setActiveGroupId: (groupId: string) => void;
  loading: boolean;
  errorMessage: string | null;
  refetchGroups: () => Promise<void>;
};

const GroupsContext = createContext<GroupsContextValue | undefined>(undefined);

type GroupMemberRow = {
  joined_at: string;
  groups: { id: string; name: string } | null;
};

const toMembershipGroup = (row: GroupMemberRow): MembershipGroup | null => {
  if (!row.groups) {
    return null;
  }

  return { id: row.groups.id, name: row.groups.name, joinedAt: row.joined_at };
};

const earliestJoinedId = (groups: MembershipGroup[]): string | null => {
  if (groups.length === 0) {
    return null;
  }

  return groups.reduce((earliest, candidate) =>
    candidate.joinedAt < earliest.joinedAt ? candidate : earliest,
  ).id;
};

// Active group selection for the map's per-group switcher (decision #4).
// Runs its own query rather than reusing useGroups.ts — context is a lower
// layer than features, same precedent as AuthProvider.
export const GroupsProvider = ({ children }: { children: ReactNode }) => {
  const { userId } = useAuth();
  const [groups, setGroups] = useState<MembershipGroup[]>([]);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const activeGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchGroups = useCallback(async () => {
    if (!userId) {
      setGroups([]);
      setActiveGroupIdState(null);
      activeGroupIdRef.current = null;
      setLoading(false);
      return;
    }

    setLoading(true);

    const [{ data, error }, storedActiveGroupId] = await Promise.all([
      supabase
        .from('group_members')
        .select('joined_at, groups(id, name)')
        .eq('user_id', userId),
      AsyncStorage.getItem(ACTIVE_GROUP_STORAGE_KEY),
    ]);

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
      .map(toMembershipGroup)
      .filter((group): group is MembershipGroup => group !== null);

    // Prefer the currently active id (if this is a refetch, not a fresh
    // mount), otherwise fall back to whatever was persisted. Either way,
    // an id no longer present in the fresh fetch (left/lost access) falls
    // back to the earliest-joined group, same as having no stored id.
    const candidateId = activeGroupIdRef.current ?? storedActiveGroupId;
    const nextActiveGroupId =
      candidateId && nextGroups.some((group) => group.id === candidateId)
        ? candidateId
        : earliestJoinedId(nextGroups);

    setGroups(nextGroups);
    setActiveGroupIdState(nextActiveGroupId);
    activeGroupIdRef.current = nextActiveGroupId;
    setErrorMessage(null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const setActiveGroupId = useCallback((groupId: string) => {
    activeGroupIdRef.current = groupId;
    setActiveGroupIdState(groupId);
    AsyncStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, groupId);
  }, []);

  const value = useMemo<GroupsContextValue>(
    () => ({
      groups,
      activeGroupId,
      setActiveGroupId,
      loading,
      errorMessage,
      refetchGroups: fetchGroups,
    }),
    [groups, activeGroupId, setActiveGroupId, loading, errorMessage, fetchGroups],
  );

  return <GroupsContext.Provider value={value}>{children}</GroupsContext.Provider>;
};

export const useGroupsContext = (): GroupsContextValue => {
  const context = useContext(GroupsContext);
  if (!context) {
    throw new Error('useGroupsContext must be used within a GroupsProvider');
  }

  return context;
};
