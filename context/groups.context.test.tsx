// context/groups.context.test.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { flush } from '../test/utils';

import { GroupsProvider, useGroupsContext, type MembershipGroup } from './groups.context';

jest.mock('../lib/supabase');
jest.mock('../context/auth.context', () => ({
  useAuth: jest.fn(() => ({
    userId: 'current-user-id',
  })),
}));

const mockedFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

const ACTIVE_GROUP_STORAGE_KEY = 'family-tracker/active-group-id';

type GroupMemberRow = {
  joined_at: string;
  groups: { id: string; name: string } | null;
};

const createMockGroupMemberRows = (groups: MembershipGroup[]): GroupMemberRow[] =>
  groups.map((group) => ({
    joined_at: group.joinedAt,
    groups: { id: group.id, name: group.name },
  }));

const mockGroupsQuery = (
  rows: GroupMemberRow[] = [],
  error: PostgrestError | null = null,
) => {
  const query = {
    eq: jest.fn().mockResolvedValue({ data: error ? null : rows, error }),
  };
  const select = jest.fn(() => query);
  mockedFrom.mockReturnValue({ select } as unknown as ReturnType<typeof supabase.from>);

  return { select, eq: query.eq };
};

const renderGroupsContext = () =>
  renderHook(() => useGroupsContext(), { wrapper: GroupsProvider });

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.clear();
});

describe('GroupsProvider', () => {
  it('fetches and exposes groups on mount', async () => {
    const groups = [
      { id: 'group-1', name: 'Family', joinedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'group-2', name: 'Work', joinedAt: '2024-01-02T00:00:00.000Z' },
    ];

    mockGroupsQuery(createMockGroupMemberRows(groups));

    const { result } = await renderGroupsContext();
    await flush();

    expect(result.current.groups).toEqual(groups);
    expect(result.current.loading).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });

  it('defaults to earliest-joined group when no stored activeGroupId exists', async () => {
    const groups = [
      { id: 'group-2', name: 'Work', joinedAt: '2024-01-02T00:00:00.000Z' },
      { id: 'group-1', name: 'Family', joinedAt: '2024-01-01T00:00:00.000Z' },
    ];

    mockGroupsQuery(createMockGroupMemberRows(groups));

    const { result } = await renderGroupsContext();
    await flush();

    expect(result.current.activeGroupId).toBe('group-1');
  });

  it('restores a valid stored activeGroupId from AsyncStorage on mount', async () => {
    const groups = [
      { id: 'group-1', name: 'Family', joinedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'group-2', name: 'Work', joinedAt: '2024-01-02T00:00:00.000Z' },
    ];

    await AsyncStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, 'group-2');
    mockGroupsQuery(createMockGroupMemberRows(groups));

    const { result } = await renderGroupsContext();
    await flush();

    expect(result.current.activeGroupId).toBe('group-2');
  });

  it('falls back to earliest-joined when stored activeGroupId is no longer in fresh fetch', async () => {
    const groups = [
      { id: 'group-1', name: 'Family', joinedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'group-2', name: 'Work', joinedAt: '2024-01-02T00:00:00.000Z' },
    ];

    // User had group-3 selected, but it's no longer in their membership
    await AsyncStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, 'group-3');
    mockGroupsQuery(createMockGroupMemberRows(groups));

    const { result } = await renderGroupsContext();
    await flush();

    expect(result.current.activeGroupId).toBe('group-1');
  });

  it('setActiveGroupId updates state and persists to AsyncStorage', async () => {
    const groups = [
      { id: 'group-1', name: 'Family', joinedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'group-2', name: 'Work', joinedAt: '2024-01-02T00:00:00.000Z' },
    ];

    mockGroupsQuery(createMockGroupMemberRows(groups));

    const { result } = await renderGroupsContext();
    await flush();

    expect(result.current.activeGroupId).toBe('group-1');

    await act(async () => {
      result.current.setActiveGroupId('group-2');
    });

    expect(result.current.activeGroupId).toBe('group-2');

    const stored = await AsyncStorage.getItem(ACTIVE_GROUP_STORAGE_KEY);
    expect(stored).toBe('group-2');
  });

  it('preserves in-memory activeGroupId across refetch (prefers current over stored)', async () => {
    const initialGroups = [
      { id: 'group-1', name: 'Family', joinedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'group-2', name: 'Work', joinedAt: '2024-01-02T00:00:00.000Z' },
    ];

    mockGroupsQuery(createMockGroupMemberRows(initialGroups));

    const { result } = await renderGroupsContext();
    await flush();

    // User selects group-2 and clears stored value
    await act(async () => {
      result.current.setActiveGroupId('group-2');
    });
    await AsyncStorage.removeItem(ACTIVE_GROUP_STORAGE_KEY);

    // Refetch with same groups
    mockGroupsQuery(createMockGroupMemberRows(initialGroups));
    await act(async () => {
      await result.current.refetchGroups();
    });
    await flush();

    // Should preserve the in-memory group-2, not fall back to earliest
    expect(result.current.activeGroupId).toBe('group-2');
  });

  it('updates loading state and reports errors', async () => {
    const error = new PostgrestError({
      message: 'network error',
      details: '',
      hint: '',
      code: 'PGRST999',
    });

    mockGroupsQuery([], error);

    const { result } = await renderGroupsContext();
    await flush();

    expect(result.current.loading).toBe(false);
    expect(result.current.errorMessage).toBe('network error');
    expect(result.current.groups).toEqual([]);
  });

  it('clears groups and activeGroupId when userId is null', async () => {
    const groups = [
      { id: 'group-1', name: 'Family', joinedAt: '2024-01-01T00:00:00.000Z' },
    ];

    await AsyncStorage.setItem(ACTIVE_GROUP_STORAGE_KEY, 'group-1');

    // Mock useAuth to return null userId
    jest.unmock('../context/auth.context');
    jest.mock('../context/auth.context', () => ({
      useAuth: jest.fn(() => ({
        userId: null,
      })),
    }));

    const { result } = await renderGroupsContext();
    await flush();

    expect(result.current.groups).toEqual([]);
    expect(result.current.activeGroupId).toBeNull();
  });

  it('handles rows with null groups (data integrity edge case)', async () => {
    const rows: GroupMemberRow[] = [
      {
        joined_at: '2024-01-01T00:00:00.000Z',
        groups: { id: 'group-1', name: 'Family' },
      },
      {
        joined_at: '2024-01-02T00:00:00.000Z',
        groups: null, // Orphaned group_members row (shouldn't happen, but defensive)
      },
    ];

    mockGroupsQuery(rows);

    const { result } = await renderGroupsContext();
    await flush();

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0]?.id).toBe('group-1');
  });
});

describe('useGroupsContext', () => {
  it('throws when used outside a GroupsProvider', async () => {
    await expect(renderHook(() => useGroupsContext())).rejects.toThrow(
      'useGroupsContext must be used within a GroupsProvider',
    );
  });
});
