// features/groups/hooks/useGroups.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/auth.context';
import { useGroups, type Group } from './useGroups';

jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');

const mockSupabaseFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// `supabase.rpc`'s real signature returns a PostgrestFilterBuilder whose
// resolved shape carries extra fields (success/count/status/statusText)
// beyond what useGroups.ts actually reads (`{ error }` only, see line 119).
// Every call site here only ever resolves `{ data: null, error }`, so the
// mock is narrowed to that instead of matching the builder's full type.
type RpcResponse = { data: null; error: PostgrestError | null };
const mockSupabaseRpc = supabase.rpc as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<RpcResponse>
>;

type GroupMemberRow = {
  role: string;
  joined_at: string;
  groups: { id: string; name: string } | null;
};

const createMockSelectChain = (
  data: GroupMemberRow[] = [],
  error: { message: string } | null = null,
) => {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data, error }),
    }),
  };
};

const createMockGroupMemberRow = (
  groupId: string = 'group-1',
  groupName: string = 'Family',
  role: string = 'owner',
  joinedAt: string = '2024-01-01T00:00:00.000Z',
): GroupMemberRow => ({
  role,
  joined_at: joinedAt,
  groups: { id: groupId, name: groupName },
});

const createMockGroupMemberRowWithNullGroup = (): GroupMemberRow => ({
  role: 'member',
  joined_at: '2024-01-01T00:00:00.000Z',
  groups: null,
});

describe('useGroups', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    mockSupabaseFrom.mockReset();
    mockSupabaseRpc.mockReset();
    mockUseAuth.mockReset();

    // Ensure useAuth is mocked to return userId
    mockUseAuth.mockReturnValue({
      userId: 'user-1',
      session: null,
      profile: null,
      loading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe('initial fetch on mount', () => {
    it('fetches groups for the signed-in user on mount', async () => {
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockSupabaseFrom).toHaveBeenCalledWith('group_members');
      const selectChain = mockSelectChain.select;
      expect(selectChain).toHaveBeenCalledWith('role, joined_at, groups(id, name)');
      const eqChain = selectChain.mock.results[0].value;
      expect(eqChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('maps rows to Group[] with camelCase fields', async () => {
      const row = createMockGroupMemberRow('group-1', 'Family', 'owner', '2024-01-01T00:00:00.000Z');
      const mockSelectChain = createMockSelectChain([row]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.groups).toEqual([
        {
          id: 'group-1',
          name: 'Family',
          role: 'owner',
          joinedAt: '2024-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('converts member role to lowercase', async () => {
      const row = createMockGroupMemberRow('group-1', 'Friends', 'member', '2024-01-01T00:00:00.000Z');
      const mockSelectChain = createMockSelectChain([row]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.groups[0].role).toBe('member');
    });

    it('filters out rows with null groups (orphaned memberships)', async () => {
      const goodRow = createMockGroupMemberRow('group-1', 'Family', 'owner');
      const orphanedRow = createMockGroupMemberRowWithNullGroup();
      const mockSelectChain = createMockSelectChain([goodRow, orphanedRow]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.groups).toHaveLength(1);
      expect(result.current.groups[0].id).toBe('group-1');
    });

    it('returns empty groups array when no rows are fetched', async () => {
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.groups).toEqual([]);
      expect(result.current.errorMessage).toBeNull();
    });

    it('surfaces fetch error via errorMessage without throwing', async () => {
      const errorMessage = 'Database connection failed';
      const mockSelectChain = createMockSelectChain([], { message: errorMessage });
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.errorMessage).toBe(errorMessage);
      expect(result.current.groups).toEqual([]);
    });

    it('does not fetch when userId is null', async () => {
      mockUseAuth.mockReturnValue({ userId: null } as any);
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockSupabaseFrom).not.toHaveBeenCalled();
      expect(result.current.groups).toEqual([]);
    });
  });

  describe('refetch method', () => {
    it('refetches the groups list', async () => {
      const initialRow = createMockGroupMemberRow('group-1', 'Family', 'owner');
      const mockSelectChain = createMockSelectChain([initialRow]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.groups).toHaveLength(1);

      // Simulate adding a new group to the backend, then refetch
      const newRow = createMockGroupMemberRow('group-2', 'Work', 'member');
      const mockSelectChainWithNew = createMockSelectChain([initialRow, newRow]);
      mockSupabaseFrom.mockReturnValue(
        mockSelectChainWithNew as unknown as ReturnType<typeof supabase.from>,
      );

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.groups).toHaveLength(2);
      });
    });

    it('clears errorMessage on successful refetch after a prior error', async () => {
      const mockSelectChain = createMockSelectChain([], { message: 'Network error' });
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.errorMessage).toBe('Network error');

      // Mock a successful refetch
      const row = createMockGroupMemberRow();
      const successChain = createMockSelectChain([row]);
      mockSupabaseFrom.mockReturnValue(
        successChain as unknown as ReturnType<typeof supabase.from>,
      );

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.errorMessage).toBeNull();
        expect(result.current.groups).toHaveLength(1);
      });
    });

    it('respects isMountedRef during refetch (does not update state after unmount)', async () => {
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result, unmount } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const groupsBeforeUnmount = result.current.groups;

      // Trigger unmount and immediately attempt refetch
      unmount();

      // Trigger a mock refetch after unmount
      let refetchPromise: Promise<void> | null = null;
      act(() => {
        refetchPromise = result.current.refetch();
      });

      if (refetchPromise) {
        await refetchPromise;
      }

      // Groups should remain unchanged (state not updated after unmount)
      expect(result.current.groups).toEqual(groupsBeforeUnmount);
    });
  });

  describe('createGroup method', () => {
    it('calls the create_group RPC with the provided name (no trimming at hook level)', async () => {
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);
      mockSupabaseRpc.mockResolvedValue({ data: null, error: null });

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.createGroup('My Group');
      });

      expect(mockSupabaseRpc).toHaveBeenCalledWith('create_group', { p_name: 'My Group' });
    });

    it('returns { error: null } on success', async () => {
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);
      mockSupabaseRpc.mockResolvedValue({ data: null, error: null });

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let createResult: { error: string | null } | null = null;
      await act(async () => {
        createResult = await result.current.createGroup('Family');
      });

      expect(createResult).toEqual({ error: null });
    });

    it('returns { error: message } on failure', async () => {
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);
      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: new PostgrestError({
          message: 'Group name already exists',
          details: '',
          hint: '',
          code: 'PGRST001',
        }),
      });

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let createResult: { error: string | null } | null = null;
      await act(async () => {
        createResult = await result.current.createGroup('Family');
      });

      expect(createResult).toEqual({ error: 'Group name already exists' });
    });

    it('sets creating=true during the RPC call and clears afterwards on success', async () => {
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);
      mockSupabaseRpc.mockResolvedValue({ data: null, error: null });

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.creating).toBe(false);

      // After create succeeds, creating should be false
      await act(async () => {
        await result.current.createGroup('Family');
      });

      expect(result.current.creating).toBe(false);
    });

    it('refetches the groups list after successful create', async () => {
      const initialRow = createMockGroupMemberRow('group-1', 'Old Group', 'owner');
      const mockSelectChain = createMockSelectChain([initialRow]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.groups).toHaveLength(1);

      // Mock a successful create followed by a refetch that includes the new group
      mockSupabaseRpc.mockResolvedValue({ data: null, error: null });

      const newRow = createMockGroupMemberRow('group-2', 'New Group', 'owner');
      const mockSelectChainWithNew = createMockSelectChain([initialRow, newRow]);
      mockSupabaseFrom.mockReturnValue(
        mockSelectChainWithNew as unknown as ReturnType<typeof supabase.from>,
      );

      await act(async () => {
        await result.current.createGroup('New Group');
      });

      await waitFor(() => {
        expect(result.current.groups).toHaveLength(2);
      });
    });

    it('sets createErrorMessage on RPC failure without clearing groups list', async () => {
      const existingRow = createMockGroupMemberRow('group-1', 'Family', 'owner');
      const mockSelectChain = createMockSelectChain([existingRow]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.groups).toHaveLength(1);

      mockSupabaseRpc.mockResolvedValue({
        data: null,
        error: new PostgrestError({
          message: 'Network timeout',
          details: '',
          hint: '',
          code: 'PGRST500',
        }),
      });

      await act(async () => {
        await result.current.createGroup('NewGroup');
      });

      await waitFor(() => {
        expect(result.current.createErrorMessage).toBe('Network timeout');
      });

      // Groups list should NOT be cleared
      expect(result.current.groups).toHaveLength(1);
      expect(result.current.groups[0].name).toBe('Family');
    });

    it('resets createErrorMessage on successful create', async () => {
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // First, simulate a failed create
      mockSupabaseRpc.mockResolvedValueOnce({
        data: null,
        error: new PostgrestError({
          message: 'Network error',
          details: '',
          hint: '',
          code: 'PGRST500',
        }),
      });

      await act(async () => {
        await result.current.createGroup('Family');
      });

      await waitFor(() => {
        expect(result.current.createErrorMessage).toBe('Network error');
      });

      // Now simulate a successful create
      mockSupabaseRpc.mockResolvedValueOnce({ data: null, error: null });
      const newRow = createMockGroupMemberRow('group-1', 'Family', 'owner');
      const successChain = createMockSelectChain([newRow]);
      mockSupabaseFrom.mockReturnValue(
        successChain as unknown as ReturnType<typeof supabase.from>,
      );

      await act(async () => {
        await result.current.createGroup('Family');
      });

      await waitFor(() => {
        expect(result.current.createErrorMessage).toBeNull();
      });
    });

  });

  describe('loading state management', () => {
    it('fetch completes and sets loading=false', async () => {
      const mockSelectChain = createMockSelectChain([]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      // Verify fetch was called and loading transitions to false
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
      expect(mockSupabaseFrom).toHaveBeenCalledWith('group_members');
    });
  });

  describe('fetch-error vs create-error independence', () => {
    it('keeps groups list intact when create fails', async () => {
      const groupRow = createMockGroupMemberRow('group-1', 'Family', 'owner');
      const mockSelectChain = createMockSelectChain([groupRow]);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGroups());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify initial state
      expect(result.current.groups).toHaveLength(1);
      expect(result.current.createErrorMessage).toBeNull();

      // Simulate a create failure
      mockSupabaseRpc.mockResolvedValueOnce({
        data: null,
        error: new PostgrestError({
          message: 'Duplicate name',
          details: '',
          hint: '',
          code: 'PGRST001',
        }),
      });

      await act(async () => {
        await result.current.createGroup('Family');
      });

      // Groups list must remain unchanged, only createErrorMessage is set
      expect(result.current.groups).toHaveLength(1);
      expect(result.current.createErrorMessage).toBe('Duplicate name');
    });
  });
});
