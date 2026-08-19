// features/groups/hooks/usePendingInvites.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/auth.context';
import { usePendingInvites, type PendingInvite } from './usePendingInvites';

jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');

const mockSupabaseRpc = supabase.rpc as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<{ data: unknown; error: PostgrestError | null }>
>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

type PendingInviteRow = {
  invite_id: string;
  group_id: string;
  group_name: string;
  created_at: string;
};

const createMockInviteRow = (
  inviteId: string = 'invite-1',
  groupId: string = 'group-1',
  groupName: string = 'Family',
  createdAt: string = '2024-01-01T00:00:00.000Z',
): PendingInviteRow => ({
  invite_id: inviteId,
  group_id: groupId,
  group_name: groupName,
  created_at: createdAt,
});

const createMockInvite = (
  id: string = 'invite-1',
  groupId: string = 'group-1',
  groupName: string = 'Family',
  createdAt: string = '2024-01-01T00:00:00.000Z',
): PendingInvite => ({
  id,
  groupId,
  groupName,
  createdAt,
});

describe('usePendingInvites', () => {
  beforeEach(() => {
    jest.resetAllMocks();

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
  });

  describe('initial fetch on mount', () => {
    it('fetches pending invites on mount', async () => {
      mockSupabaseRpc.mockResolvedValueOnce({ data: [], error: null });

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockSupabaseRpc).toHaveBeenCalledWith('list_my_pending_invites');
    });

    it('maps rows to PendingInvite[] with camelCase fields', async () => {
      const row = createMockInviteRow('invite-1', 'group-1', 'Family');
      mockSupabaseRpc.mockResolvedValueOnce({ data: [row], error: null });

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.invites).toEqual([
        {
          id: 'invite-1',
          groupId: 'group-1',
          groupName: 'Family',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('returns empty invites array when no rows are fetched', async () => {
      mockSupabaseRpc.mockResolvedValueOnce({ data: [], error: null });

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.invites).toEqual([]);
      expect(result.current.errorMessage).toBeNull();
    });

    it('surfaces fetch error via errorMessage without throwing', async () => {
      const errorMessage = 'Database connection failed';
      mockSupabaseRpc.mockResolvedValueOnce({
        data: null,
        error: new PostgrestError({
          message: errorMessage,
          details: '',
          hint: '',
          code: 'PGRST500',
        }),
      });

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.errorMessage).toBe(errorMessage);
      expect(result.current.invites).toEqual([]);
    });

    it('does not fetch when userId is null', async () => {
      mockUseAuth.mockReturnValue({ userId: null } as any);
      mockSupabaseRpc.mockResolvedValueOnce({ data: [], error: null });

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockSupabaseRpc).not.toHaveBeenCalled();
      expect(result.current.invites).toEqual([]);
    });
  });

  describe('refetch method', () => {
    it('refetches the invites list', async () => {
      const initialRow = createMockInviteRow('invite-1', 'group-1', 'Family');
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [initialRow], error: null }) // initial fetch
        .mockResolvedValueOnce({ data: [initialRow, createMockInviteRow('invite-2', 'group-2', 'Work')], error: null }); // refetch

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.invites).toHaveLength(1);

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.invites).toHaveLength(2);
      });
    });

    it('clears errorMessage on successful refetch after a prior error', async () => {
      mockSupabaseRpc
        .mockResolvedValueOnce({
          data: null,
          error: new PostgrestError({
            message: 'Network error',
            details: '',
            hint: '',
            code: 'PGRST500',
          }),
        }) // initial fetch error
        .mockResolvedValueOnce({ data: [createMockInviteRow()], error: null }); // successful refetch

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.errorMessage).toBe('Network error');

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.errorMessage).toBeNull();
        expect(result.current.invites).toHaveLength(1);
      });
    });
  });

  describe('respond method', () => {
    it('calls accept_invite RPC on accept decision', async () => {
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [], error: null }) // initial fetch
        .mockResolvedValueOnce({ data: null, error: null }) // accept_invite
        .mockResolvedValueOnce({ data: [], error: null }); // refetch

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let respondResult;
      await act(async () => {
        respondResult = await result.current.respond('invite-1', 'accept');
      });

      expect(respondResult).toEqual({ error: null });
      const calls = mockSupabaseRpc.mock.calls;
      expect(calls[1][0]).toBe('accept_invite');
      expect(calls[1][1]).toEqual({ p_invite_id: 'invite-1' });
    });

    it('calls decline_invite RPC on decline decision', async () => {
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [], error: null }) // initial fetch
        .mockResolvedValueOnce({ data: null, error: null }) // decline_invite
        .mockResolvedValueOnce({ data: [], error: null }); // refetch

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let respondResult;
      await act(async () => {
        respondResult = await result.current.respond('invite-1', 'decline');
      });

      expect(respondResult).toEqual({ error: null });
      const calls = mockSupabaseRpc.mock.calls;
      expect(calls[1][0]).toBe('decline_invite');
    });

    it('returns { error: null } on successful respond', async () => {
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [], error: null }) // initial fetch
        .mockResolvedValueOnce({ data: null, error: null }) // respond
        .mockResolvedValueOnce({ data: [], error: null }); // refetch

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let respondResult;
      await act(async () => {
        respondResult = await result.current.respond('invite-1', 'accept');
      });

      expect(respondResult).toEqual({ error: null });
    });

    it('returns { error: message } on RPC failure', async () => {
      const errorMsg = 'Invite already responded';
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [], error: null }) // initial fetch
        .mockResolvedValueOnce({
          data: null,
          error: new PostgrestError({
            message: errorMsg,
            details: '',
            hint: '',
            code: 'PGRST001',
          }),
        }); // respond failure

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      let respondResult;
      await act(async () => {
        respondResult = await result.current.respond('invite-1', 'accept');
      });

      expect(respondResult).toEqual({ error: errorMsg });
    });

    it('refetches invites after successful respond', async () => {
      const initialRow = createMockInviteRow('invite-1', 'group-1', 'Family');
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [initialRow], error: null }) // initial fetch
        .mockResolvedValueOnce({ data: null, error: null }) // respond success
        .mockResolvedValueOnce({ data: [], error: null }); // refetch after respond

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.invites).toHaveLength(1);

      await act(async () => {
        await result.current.respond('invite-1', 'accept');
      });

      await waitFor(() => {
        expect(result.current.invites).toHaveLength(0);
      });
    });

    it('does not refetch invites after failed respond', async () => {
      const initialRow = createMockInviteRow('invite-1', 'group-1', 'Family');
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [initialRow], error: null }) // initial fetch
        .mockResolvedValueOnce({
          data: null,
          error: new PostgrestError({
            message: 'Error',
            details: '',
            hint: '',
            code: 'PGRST500',
          }),
        }); // respond failure (no refetch)

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.invites).toHaveLength(1);

      await act(async () => {
        await result.current.respond('invite-1', 'accept');
      });

      expect(result.current.invites).toHaveLength(1);
    });
  });

  describe('respondErrorMessage and respondErrorInviteId (FT-10 bug fix)', () => {
    it('sets respondErrorMessage and respondErrorInviteId scoped to the correct invite', async () => {
      const errorMsg = 'Group no longer exists';
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [], error: null }) // initial fetch
        .mockResolvedValueOnce({
          data: null,
          error: new PostgrestError({
            message: errorMsg,
            details: '',
            hint: '',
            code: 'PGRST001',
          }),
        }); // respond failure

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.respond('invite-1', 'accept');
      });

      expect(result.current.respondErrorMessage).toBe(errorMsg);
      expect(result.current.respondErrorInviteId).toBe('invite-1');
    });

    it('clears respondErrorMessage and respondErrorInviteId at the start of next respond call', async () => {
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [], error: null }) // initial fetch
        .mockResolvedValueOnce({
          data: null,
          error: new PostgrestError({
            message: 'First error',
            details: '',
            hint: '',
            code: 'PGRST001',
          }),
        }) // first respond failure
        .mockResolvedValueOnce({ data: [], error: null }) // refetch
        .mockResolvedValueOnce({ data: null, error: null }); // second respond success

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // First respond fails
      await act(async () => {
        await result.current.respond('invite-1', 'accept');
      });

      expect(result.current.respondErrorMessage).toBe('First error');
      expect(result.current.respondErrorInviteId).toBe('invite-1');

      // Second respond succeeds - error should clear at start
      await act(async () => {
        await result.current.respond('invite-2', 'decline');
      });

      expect(result.current.respondErrorMessage).toBeNull();
      expect(result.current.respondErrorInviteId).toBeNull();
    });

    it('keeps respondErrorMessage null on successful respond', async () => {
      mockSupabaseRpc
        .mockResolvedValueOnce({ data: [], error: null }) // initial fetch
        .mockResolvedValueOnce({ data: null, error: null }) // respond
        .mockResolvedValueOnce({ data: [], error: null }); // refetch

      const { result } = await renderHook(() => usePendingInvites());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.respond('invite-1', 'accept');
      });

      expect(result.current.respondErrorMessage).toBeNull();
      expect(result.current.respondErrorInviteId).toBeNull();
    });
  });
});
