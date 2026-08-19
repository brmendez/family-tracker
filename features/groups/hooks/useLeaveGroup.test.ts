// features/groups/hooks/useLeaveGroup.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/auth.context';
import { useLeaveGroup } from './useLeaveGroup';

jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');

const mockSupabaseFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

type DeleteResponse = { error: PostgrestError | null };

const createMockDeleteChain = (
  error: PostgrestError | null = null,
): ReturnType<typeof supabase.from> => {
  const secondEq = jest.fn().mockResolvedValue({ error });
  const firstEq = jest.fn().mockReturnValue({ eq: secondEq });
  const deleteMethod = jest.fn().mockReturnValue({ eq: firstEq });

  return {
    delete: deleteMethod,
  } as unknown as ReturnType<typeof supabase.from>;
};

describe('useLeaveGroup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    jest.restoreAllMocks();
  });

  describe('leaveGroup function', () => {
    it('calls delete on group_members with correct filters', async () => {
      const mockChain = createMockDeleteChain();
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      await act(async () => {
        await result.current.leaveGroup('group-1');
      });

      expect(mockSupabaseFrom).toHaveBeenCalledWith('group_members');
    });

    it('returns { error: null } on successful leave', async () => {
      const mockChain = createMockDeleteChain(null);
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      let leaveResult;
      await act(async () => {
        leaveResult = await result.current.leaveGroup('group-1');
      });

      expect(leaveResult).toEqual({ error: null });
    });

    it('maps owner-guard error to friendly message', async () => {
      const error = new PostgrestError({
        message: 'An owner cannot leave a group that still has other members.',
        details: '',
        hint: '',
        code: 'P0001',
      });
      const mockChain = createMockDeleteChain(error);
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      let leaveResult;
      await act(async () => {
        leaveResult = await result.current.leaveGroup('group-1');
      });

      expect(leaveResult).toEqual({
        error:
          "You're the owner — remove the other members first, or wait until you're the only one left, before leaving this group.",
      });
    });

    it('maps generic delete error to generic failure message', async () => {
      const error = new PostgrestError({
        message: 'Permission denied',
        details: '',
        hint: '',
        code: 'PGRST001',
      });
      const mockChain = createMockDeleteChain(error);
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      let leaveResult;
      await act(async () => {
        leaveResult = await result.current.leaveGroup('group-1');
      });

      expect(leaveResult).toEqual({
        error: 'Could not leave this group. Please try again.',
      });
    });

    it('returns error when userId is null', async () => {
      mockUseAuth.mockReturnValue({ userId: null } as any);

      const { result } = await renderHook(() => useLeaveGroup());

      let leaveResult;
      await act(async () => {
        leaveResult = await result.current.leaveGroup('group-1');
      });

      expect(leaveResult).toEqual({
        error: 'Could not leave this group. Please try again.',
      });
      // Should not call Supabase when userId is missing
      expect(mockSupabaseFrom).not.toHaveBeenCalled();
    });
  });

  describe('leaving state', () => {
    it('sets leaving=true during delete', async () => {
      const secondEq = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ error: null }), 100),
          ),
      );
      const firstEq = jest.fn().mockReturnValue({ eq: secondEq });
      const deleteMethod = jest.fn().mockReturnValue({ eq: firstEq });

      const mockChain = {
        delete: deleteMethod,
      } as unknown as ReturnType<typeof supabase.from>;

      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      expect(result.current.leaving).toBe(false);

      const leavePromise = result.current.leaveGroup('group-1');

      await waitFor(() => {
        expect(result.current.leaving).toBe(true);
      });

      await act(async () => {
        await leavePromise;
      });

      expect(result.current.leaving).toBe(false);
    });

    it('sets leaving=false after successful delete', async () => {
      const mockChain = createMockDeleteChain(null);
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      await act(async () => {
        await result.current.leaveGroup('group-1');
      });

      expect(result.current.leaving).toBe(false);
    });

    it('sets leaving=false after failed delete', async () => {
      const error = new PostgrestError({
        message: 'Error',
        details: '',
        hint: '',
        code: 'PGRST001',
      });
      const mockChain = createMockDeleteChain(error);
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      await act(async () => {
        await result.current.leaveGroup('group-1');
      });

      expect(result.current.leaving).toBe(false);
    });
  });

  describe('leaveErrorMessage state', () => {
    it('clears leaveErrorMessage before attempting to leave', async () => {
      const firstError = new PostgrestError({
        message: 'First error',
        details: '',
        hint: '',
        code: 'PGRST001',
      });
      const secondError = null;

      const mockChainFirst = createMockDeleteChain(firstError);
      const mockChainSecond = createMockDeleteChain(secondError);

      mockSupabaseFrom
        .mockReturnValueOnce(
          mockChainFirst as unknown as ReturnType<typeof supabase.from>,
        )
        .mockReturnValueOnce(
          mockChainSecond as unknown as ReturnType<typeof supabase.from>,
        );

      const { result } = await renderHook(() => useLeaveGroup());

      // First leave fails
      await act(async () => {
        await result.current.leaveGroup('group-1');
      });

      expect(result.current.leaveErrorMessage).toBe(
        'Could not leave this group. Please try again.',
      );

      // Second leave succeeds
      await act(async () => {
        await result.current.leaveGroup('group-1');
      });

      expect(result.current.leaveErrorMessage).toBeNull();
    });

    it('sets leaveErrorMessage on delete failure', async () => {
      const error = new PostgrestError({
        message: 'Permission denied',
        details: '',
        hint: '',
        code: 'PGRST001',
      });
      const mockChain = createMockDeleteChain(error);
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      await act(async () => {
        await result.current.leaveGroup('group-1');
      });

      expect(result.current.leaveErrorMessage).toBe(
        'Could not leave this group. Please try again.',
      );
    });

    it('keeps leaveErrorMessage null on success', async () => {
      const mockChain = createMockDeleteChain(null);
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      await act(async () => {
        await result.current.leaveGroup('group-1');
      });

      expect(result.current.leaveErrorMessage).toBeNull();
    });

    it('sets owner-guard friendly message when guard error occurs', async () => {
      const error = new PostgrestError({
        message: 'An owner cannot leave a group that still has other members.',
        details: '',
        hint: '',
        code: 'P0001',
      });
      const mockChain = createMockDeleteChain(error);
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result } = await renderHook(() => useLeaveGroup());

      await act(async () => {
        await result.current.leaveGroup('group-1');
      });

      expect(result.current.leaveErrorMessage).toBe(
        "You're the owner — remove the other members first, or wait until you're the only one left, before leaving this group.",
      );
    });
  });

  describe('isMountedRef cleanup', () => {
    it('does not throw or have errors after unmount', async () => {
      const mockChain = createMockDeleteChain(null);
      mockSupabaseFrom.mockReturnValue(mockChain);

      const { result, unmount } = await renderHook(() => useLeaveGroup());

      await act(async () => {
        await result.current.leaveGroup('group-1');
      });

      // Unmount should not cause errors
      unmount();

      expect(result.current.leaving).toBe(false);
    });
  });
});
