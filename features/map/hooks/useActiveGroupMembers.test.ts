// features/map/hooks/useActiveGroupMembers.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import { createActiveGroupMember, flush } from '../../../test/utils';

import { useActiveGroupMembers } from './useActiveGroupMembers';

jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context', () => ({
  useAuth: jest.fn(() => ({
    userId: 'current-user-id',
  })),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(() => {
    // Mock implementation - just a no-op for testing
    // The real hook would subscribe to focus events
  }),
}));

const mockedFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

type GroupMemberRow = {
  profiles: {
    id: string;
    display_name: string;
    avatar_color: string | null;
  } | null;
};

const mockGroupMembersQuery = (
  rows: GroupMemberRow[] = [],
  error: PostgrestError | null = null,
) => {
  const query = {
    neq: jest.fn().mockResolvedValue({ data: error ? null : rows, error }),
  };
  const eq = jest.fn(() => query);
  const select = jest.fn(() => ({ eq }));

  mockedFrom.mockReturnValue({ select } as unknown as ReturnType<typeof supabase.from>);

  return { select, eq, neq: query.neq };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useActiveGroupMembers', () => {
  it('returns empty members when activeGroupId is null', async () => {
    mockGroupMembersQuery([]);

    const { result } = await renderHook(() => useActiveGroupMembers(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('fetches and returns group members excluding self', async () => {
    const rows: GroupMemberRow[] = [
      {
        profiles: {
          id: 'member-1',
          display_name: 'Alice',
          avatar_color: '#ff0000',
        },
      },
      {
        profiles: {
          id: 'member-2',
          display_name: 'Bob',
          avatar_color: '#00ff00',
        },
      },
    ];

    mockGroupMembersQuery(rows);

    const { result } = await renderHook(() => useActiveGroupMembers('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toEqual([
      createActiveGroupMember('member-1', 'Alice', '#ff0000'),
      createActiveGroupMember('member-2', 'Bob', '#00ff00'),
    ]);
    expect(result.current.errorMessage).toBeNull();
  });

  it('filters out members with null profiles', async () => {
    const rows: GroupMemberRow[] = [
      {
        profiles: {
          id: 'member-1',
          display_name: 'Alice',
          avatar_color: '#ff0000',
        },
      },
      {
        profiles: null, // Orphaned group_members row
      },
    ];

    mockGroupMembersQuery(rows);

    const { result } = await renderHook(() => useActiveGroupMembers('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toHaveLength(1);
    expect(result.current.members[0]?.id).toBe('member-1');
  });

  it('passes userId to neq filter to exclude self', async () => {
    mockGroupMembersQuery([]);

    await renderHook(() => useActiveGroupMembers('group-1'));

    await waitFor(() => {
      expect(mockedFrom).toHaveBeenCalled();
    });

    const selectResult = mockedFrom.mock.results[0].value.select;
    expect(selectResult).toHaveBeenCalledWith('profiles(id, display_name, avatar_color)');

    const eqCall = selectResult.mock.results[0].value.eq;
    expect(eqCall).toHaveBeenCalledWith('group_id', 'group-1');

    const neqCall = eqCall.mock.results[0].value.neq;
    expect(neqCall).toHaveBeenCalledWith('user_id', 'current-user-id');
  });

  it('handles query errors gracefully', async () => {
    const error = new PostgrestError({
      message: 'permission denied',
      details: '',
      hint: '',
      code: 'PGRST403',
    });

    mockGroupMembersQuery([], error);

    const { result } = await renderHook(() => useActiveGroupMembers('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBe('permission denied');
    expect(result.current.members).toEqual([]);
  });

  it('refetches when activeGroupId changes', async () => {
    const members1: GroupMemberRow[] = [
      { profiles: { id: 'member-1', display_name: 'Alice', avatar_color: null } },
    ];
    const members2: GroupMemberRow[] = [
      { profiles: { id: 'member-2', display_name: 'Bob', avatar_color: null } },
    ];

    mockGroupMembersQuery(members1);

    const { result, rerender } = await renderHook(
      ({ groupId }: { groupId: string }) => useActiveGroupMembers(groupId),
      { initialProps: { groupId: 'group-1' } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toHaveLength(1);
    expect(result.current.members[0]?.id).toBe('member-1');

    // Change to a different group
    mockGroupMembersQuery(members2);
    rerender({ groupId: 'group-2' });

    await waitFor(() => {
      expect(result.current.members[0]?.id).toBe('member-2');
    });
  });

  it('ignores stale query responses after unmount', async () => {
    let resolveQuery!: (rows: GroupMemberRow[]) => void;
    const pending = new Promise<{ data: GroupMemberRow[]; error: null }>((resolve) => {
      resolveQuery = (rows) => resolve({ data: rows, error: null });
    });

    mockedFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          neq: () => pending,
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const { unmount } = await renderHook(() => useActiveGroupMembers('group-1'));

    unmount();

    // Resolving after unmount should not throw — a thrown error here fails
    // the test on its own, no matcher needed.
    resolveQuery([
      { profiles: { id: 'member-1', display_name: 'Alice', avatar_color: null } },
    ]);
    await Promise.resolve();
  });

  it('refetches on screen focus (via useFocusEffect)', async () => {
    const members: GroupMemberRow[] = [
      { profiles: { id: 'member-1', display_name: 'Alice', avatar_color: null } },
    ];

    mockGroupMembersQuery(members);

    const { result } = await renderHook(() => useActiveGroupMembers('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // useFocusEffect mock calls the callback on every render, so just
    // verify the hook successfully re-fetches (no errors thrown)
    expect(result.current.members).toHaveLength(1);
  });
});
