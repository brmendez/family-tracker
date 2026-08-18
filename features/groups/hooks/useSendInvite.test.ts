// features/groups/hooks/useSendInvite.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import { useSendInvite } from './useSendInvite';

jest.mock('../../../lib/supabase');

const mockSupabaseRpc = supabase.rpc as unknown as jest.MockedFunction<
  (...args: unknown[]) => Promise<{ error: PostgrestError | null }>
>;

describe('useSendInvite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseRpc.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendInvite function', () => {
    it('calls send_invite RPC with groupId and email', async () => {
      mockSupabaseRpc.mockResolvedValue({ error: null });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      await act(async () => {
        await result.current.sendInvite('user@example.com');
      });

      expect(mockSupabaseRpc).toHaveBeenCalledWith('send_invite', {
        p_group_id: 'group-1',
        p_email: 'user@example.com',
      });
    });

    it('returns { error: null } on successful send', async () => {
      mockSupabaseRpc.mockResolvedValue({ error: null });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      let sendResult;
      await act(async () => {
        sendResult = await result.current.sendInvite('user@example.com');
      });

      expect(sendResult).toEqual({ error: null });
    });

    it('returns { error: message } on RPC failure', async () => {
      const errorMsg = 'Email already a member';
      mockSupabaseRpc.mockResolvedValue({
        error: new PostgrestError({
          message: errorMsg,
          details: '',
          hint: '',
          code: 'PGRST001',
        }),
      });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      let sendResult;
      await act(async () => {
        sendResult = await result.current.sendInvite('existing@example.com');
      });

      expect(sendResult).toEqual({ error: errorMsg });
    });

    it('returns error when groupId is undefined', async () => {
      const { result } = await renderHook(() => useSendInvite(undefined));

      let sendResult;
      await act(async () => {
        sendResult = await result.current.sendInvite('user@example.com');
      });

      expect(sendResult).toEqual({ error: 'Missing group.' });
      expect(mockSupabaseRpc).not.toHaveBeenCalled();
    });

    it('passes email exactly as provided to RPC (no trimming at hook level)', async () => {
      mockSupabaseRpc.mockResolvedValue({ error: null });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      await act(async () => {
        await result.current.sendInvite('  user@example.com  ');
      });

      expect(mockSupabaseRpc).toHaveBeenCalledWith('send_invite', {
        p_group_id: 'group-1',
        p_email: '  user@example.com  ',
      });
    });

    it('handles case-insensitive email (no case normalization at hook level)', async () => {
      mockSupabaseRpc.mockResolvedValue({ error: null });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      await act(async () => {
        await result.current.sendInvite('User@Example.COM');
      });

      expect(mockSupabaseRpc).toHaveBeenCalledWith('send_invite', {
        p_group_id: 'group-1',
        p_email: 'User@Example.COM',
      });
    });
  });

  describe('sending state', () => {
    it('sets sending=true during RPC call', async () => {
      mockSupabaseRpc.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100)),
      );

      const { result } = await renderHook(() => useSendInvite('group-1'));

      expect(result.current.sending).toBe(false);

      const sendPromise = result.current.sendInvite('user@example.com');

      await waitFor(() => {
        expect(result.current.sending).toBe(true);
      });

      await act(async () => {
        await sendPromise;
      });
      expect(result.current.sending).toBe(false);
    });

    it('sets sending=false after successful RPC', async () => {
      mockSupabaseRpc.mockResolvedValue({ error: null });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      await act(async () => {
        await result.current.sendInvite('user@example.com');
      });

      expect(result.current.sending).toBe(false);
    });

    it('sets sending=false after failed RPC', async () => {
      mockSupabaseRpc.mockResolvedValue({
        error: new PostgrestError({
          message: 'Error',
          details: '',
          hint: '',
          code: 'PGRST001',
        }),
      });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      await act(async () => {
        await result.current.sendInvite('user@example.com');
      });

      expect(result.current.sending).toBe(false);
    });
  });

  describe('sendErrorMessage state', () => {
    it('clears sendErrorMessage before sending', async () => {
      mockSupabaseRpc
        .mockResolvedValueOnce({
          error: new PostgrestError({
            message: 'First error',
            details: '',
            hint: '',
            code: 'PGRST001',
          }),
        })
        .mockResolvedValueOnce({ error: null });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      await act(async () => {
        await result.current.sendInvite('user@example.com');
      });

      expect(result.current.sendErrorMessage).toBe('First error');

      await act(async () => {
        await result.current.sendInvite('user@example.com');
      });

      expect(result.current.sendErrorMessage).toBeNull();
    });

    it('sets sendErrorMessage on RPC failure', async () => {
      const errorMsg = 'Email already a member';
      mockSupabaseRpc.mockResolvedValue({
        error: new PostgrestError({
          message: errorMsg,
          details: '',
          hint: '',
          code: 'PGRST001',
        }),
      });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      await act(async () => {
        await result.current.sendInvite('user@example.com');
      });

      expect(result.current.sendErrorMessage).toBe(errorMsg);
    });

    it('keeps sendErrorMessage null on success', async () => {
      mockSupabaseRpc.mockResolvedValue({ error: null });

      const { result } = await renderHook(() => useSendInvite('group-1'));

      await act(async () => {
        await result.current.sendInvite('user@example.com');
      });

      expect(result.current.sendErrorMessage).toBeNull();
    });
  });

  describe('isMountedRef cleanup', () => {
    it('does not throw or have errors after unmount', async () => {
      mockSupabaseRpc.mockResolvedValue({ error: null });

      const { result, unmount } = await renderHook(() => useSendInvite('group-1'));

      await act(async () => {
        await result.current.sendInvite('user@example.com');
      });

      // Unmount should not cause errors
      unmount();

      expect(result.current.sending).toBe(false);
    });
  });
});
