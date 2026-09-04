import { act, renderHook, waitFor } from '@testing-library/react-native';

import { supabase } from '../../../lib/supabase';
import { useGroupRoster } from './useGroupRoster';

jest.mock('../../../lib/supabase');

const mockedFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

type GroupMemberRow = {
  profiles: {
    id: string;
    display_name: string;
    avatar_color: string | null;
  } | null;
};

describe('useGroupRoster', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockQueryResponse = (data: GroupMemberRow[] | null = null, error: any = null) => {
    const eqFn = jest.fn().mockResolvedValue({ data, error });
    const selectFn = jest.fn().mockReturnValue({ eq: eqFn });
    mockedFrom.mockReturnValue({ select: selectFn } as unknown as ReturnType<typeof supabase.from>);
    return { selectFn, eqFn };
  };

  it('returns empty members and not loading when activeGroupId is null', async () => {
    const { result } = await renderHook(() => useGroupRoster(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });

  it('fetches and returns all current group members unfiltered by hide state', async () => {
    const mockMembers: GroupMemberRow[] = [
      {
        profiles: {
          id: 'user-alice',
          display_name: 'Alice',
          avatar_color: '#ff0000',
        },
      },
      {
        profiles: {
          id: 'user-bob',
          display_name: 'Bob',
          avatar_color: '#00ff00',
        },
      },
      {
        profiles: {
          id: 'user-charlie',
          display_name: 'Charlie',
          avatar_color: null,
        },
      },
    ];

    mockQueryResponse(mockMembers);

    const { result } = await renderHook(() => useGroupRoster('group-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toHaveLength(3);
    expect(result.current.members[0]).toEqual({
      id: 'user-alice',
      displayName: 'Alice',
      avatarColor: '#ff0000',
    });
    expect(result.current.errorMessage).toBeNull();
  });

  it('filters query by the correct group_id', async () => {
    const { selectFn, eqFn } = mockQueryResponse([]);

    await renderHook(() => useGroupRoster('group-xyz'));

    await waitFor(() => {
      expect(selectFn).toHaveBeenCalledWith('profiles(id, display_name, avatar_color)');
    });

    expect(eqFn).toHaveBeenCalledWith('group_id', 'group-xyz');
  });

  it('sets error message when fetch fails', async () => {
    const mockError = new Error('Network error');
    mockQueryResponse(null, mockError);

    const { result } = await renderHook(() => useGroupRoster('group-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBe('Network error');
    expect(result.current.members).toEqual([]);
  });

  it('filters out members with null profiles (data inconsistency)', async () => {
    const mockMembers: GroupMemberRow[] = [
      {
        profiles: {
          id: 'user-alice',
          display_name: 'Alice',
          avatar_color: null,
        },
      },
      {
        profiles: null, // Shouldn't happen in normal RLS, but defensive
      },
      {
        profiles: {
          id: 'user-charlie',
          display_name: 'Charlie',
          avatar_color: null,
        },
      },
    ];

    mockQueryResponse(mockMembers);

    const { result } = await renderHook(() => useGroupRoster('group-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toHaveLength(2);
    expect(result.current.members.map((m) => m.id)).toEqual(['user-alice', 'user-charlie']);
  });

  it('initially returns loading=true', async () => {
    const eqFn = jest.fn(
      () =>
        new Promise(() => {
          // Never resolves
        }),
    );
    const selectFn = jest.fn().mockReturnValue({ eq: eqFn });
    mockedFrom.mockReturnValue({ select: selectFn } as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useGroupRoster('group-123'));

    expect(result.current.loading).toBe(true);
  });

  it('refetches when activeGroupId changes', async () => {
    const mockRows1: GroupMemberRow[] = [
      {
        profiles: {
          id: 'user-alice',
          display_name: 'Alice',
          avatar_color: null,
        },
      },
    ];

    mockQueryResponse(mockRows1);

    const { result, rerender } = await renderHook(
      ({ activeGroupId }: { activeGroupId: string | null }) => useGroupRoster(activeGroupId),
      { initialProps: { activeGroupId: 'group-1' } },
    );

    await waitFor(() => {
      expect(result.current.members).toHaveLength(1);
      expect(result.current.members[0].displayName).toBe('Alice');
    });

    const mockRows2: GroupMemberRow[] = [
      {
        profiles: {
          id: 'user-bob',
          display_name: 'Bob',
          avatar_color: null,
        },
      },
    ];

    mockQueryResponse(mockRows2);

    await act(async () => {
      rerender({ activeGroupId: 'group-2' });
    });

    await waitFor(() => {
      expect(result.current.members).toHaveLength(1);
      expect(result.current.members[0].displayName).toBe('Bob');
    });
  });

  it('returns empty array when query returns null data', async () => {
    mockQueryResponse(null);

    const { result } = await renderHook(() => useGroupRoster('group-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toEqual([]);
  });

  it('handles empty roster (no members in group)', async () => {
    mockQueryResponse([]);

    const { result } = await renderHook(() => useGroupRoster('group-123'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });
});
