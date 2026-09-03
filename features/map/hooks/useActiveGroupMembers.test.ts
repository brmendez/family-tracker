// features/map/hooks/useActiveGroupMembers.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import { createActiveGroupMember } from '../../../test/utils';

import { useActiveGroupMembers } from './useActiveGroupMembers';

jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context', () => ({
  useAuth: jest.fn(() => ({
    userId: 'current-user-id',
  })),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn((callback) => {
    // Store callback for testing, don't call automatically
  }),
}));

const mockSupabaseRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

type VisibleGroupMemberRow = {
  user_id: string;
  display_name: string;
  avatar_color: string | null;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useActiveGroupMembers', () => {
  it('returns empty members when activeGroupId is null', async () => {
    mockSupabaseRpc.mockResolvedValue({ data: [], error: null } as any);

    const { result } = await renderHook(() => useActiveGroupMembers(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
    expect(mockSupabaseRpc).not.toHaveBeenCalled();
  });

  it('calls RPC with correct p_group_id parameter', async () => {
    mockSupabaseRpc.mockResolvedValue({ data: [], error: null } as any);

    await renderHook(() => useActiveGroupMembers('group-123'));

    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalled();
    });

    expect(mockSupabaseRpc).toHaveBeenCalledWith('get_visible_group_members', {
      p_group_id: 'group-123',
    });
  });

  it('maps RPC response to ActiveGroupMember shape', async () => {
    const rows: VisibleGroupMemberRow[] = [
      {
        user_id: 'member-1',
        display_name: 'Alice',
        avatar_color: '#ff0000',
      },
      {
        user_id: 'member-2',
        display_name: 'Bob',
        avatar_color: '#00ff00',
      },
    ];

    mockSupabaseRpc.mockResolvedValue({ data: rows, error: null } as any);

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

  it('handles null avatar_color gracefully', async () => {
    const rows: VisibleGroupMemberRow[] = [
      {
        user_id: 'member-1',
        display_name: 'Charlie',
        avatar_color: null,
      },
    ];

    mockSupabaseRpc.mockResolvedValue({ data: rows, error: null } as any);

    const { result } = await renderHook(() => useActiveGroupMembers('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toEqual([
      createActiveGroupMember('member-1', 'Charlie', null),
    ]);
  });

  it('handles RPC errors gracefully', async () => {
    const error = new PostgrestError({
      message: 'permission denied',
      details: '',
      hint: '',
      code: 'PGRST403',
    });

    mockSupabaseRpc.mockResolvedValue({ data: null, error } as any);

    const { result } = await renderHook(() => useActiveGroupMembers('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBe('permission denied');
    expect(result.current.members).toEqual([]);
  });

  it('clears previous error on successful refetch', async () => {
    const error = new PostgrestError({
      message: 'error fetching members',
      details: '',
      hint: '',
      code: 'PGRST500',
    });

    mockSupabaseRpc.mockResolvedValue({ data: null, error } as any);

    const { result, rerender } = await renderHook(
      ({ groupId }: { groupId: string | null }) => useActiveGroupMembers(groupId),
      { initialProps: { groupId: 'group-1' } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBe('error fetching members');

    // Mock successful response for refetch
    const rows: VisibleGroupMemberRow[] = [
      {
        user_id: 'member-1',
        display_name: 'David',
        avatar_color: '#0000ff',
      },
    ];

    mockSupabaseRpc.mockResolvedValue({ data: rows, error: null } as any);

    // Trigger refetch by changing activeGroupId
    rerender({ groupId: 'group-2' });

    await waitFor(() => {
      expect(result.current.errorMessage).toBeNull();
      expect(result.current.members).toHaveLength(1);
    });
  });

  it('refetches on activeGroupId change', async () => {
    const members1: VisibleGroupMemberRow[] = [
      { user_id: 'member-1', display_name: 'Alice', avatar_color: null },
    ];
    const members2: VisibleGroupMemberRow[] = [
      { user_id: 'member-2', display_name: 'Bob', avatar_color: null },
    ];

    mockSupabaseRpc.mockResolvedValue({ data: members1, error: null } as any);

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
    mockSupabaseRpc.mockResolvedValue({ data: members2, error: null } as any);
    rerender({ groupId: 'group-2' });

    await waitFor(() => {
      expect(result.current.members[0]?.id).toBe('member-2');
    });

    expect(mockSupabaseRpc).toHaveBeenCalledWith('get_visible_group_members', {
      p_group_id: 'group-2',
    });
  });


  it('handles empty member list from RPC', async () => {
    mockSupabaseRpc.mockResolvedValue({ data: [], error: null } as any);

    const { result } = await renderHook(() => useActiveGroupMembers('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toEqual([]);
    expect(result.current.errorMessage).toBeNull();
  });

  it('maps multiple members correctly preserving order', async () => {
    const rows: VisibleGroupMemberRow[] = [
      { user_id: 'alice', display_name: 'Alice', avatar_color: '#ff0000' },
      { user_id: 'bob', display_name: 'Bob', avatar_color: '#00ff00' },
      { user_id: 'charlie', display_name: 'Charlie', avatar_color: '#0000ff' },
    ];

    mockSupabaseRpc.mockResolvedValue({ data: rows, error: null } as any);

    const { result } = await renderHook(() => useActiveGroupMembers('group-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.members).toHaveLength(3);
    expect(result.current.members[0]?.displayName).toBe('Alice');
    expect(result.current.members[1]?.displayName).toBe('Bob');
    expect(result.current.members[2]?.displayName).toBe('Charlie');
  });
});
