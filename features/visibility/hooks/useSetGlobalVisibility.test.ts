// features/visibility/hooks/useSetGlobalVisibility.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import { useSetGlobalVisibility } from './useSetGlobalVisibility';

jest.mock('../../../lib/supabase');

const mockSupabaseRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;

describe('useSetGlobalVisibility', () => {
  const mockRefetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRefetch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setVisibility method', () => {
    const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const actionCases: Array<[string, Record<string, unknown>]> = [
      ['1h', { p_hidden: true, p_duration_minutes: 60, p_timezone: null }],
      ['2h', { p_hidden: true, p_duration_minutes: 120, p_timezone: null }],
      ['4h', { p_hidden: true, p_duration_minutes: 240, p_timezone: null }],
      ['allDay', { p_hidden: true, p_duration_minutes: null, p_timezone: localTimezone }],
      ['indefinite', { p_hidden: true, p_duration_minutes: null, p_timezone: null }],
      ['unhide', { p_hidden: false, p_duration_minutes: null, p_timezone: null }],
    ];

    it.each(actionCases)('calls set_global_visibility RPC with correct params for %s action', async (action, expectedParams) => {
      mockSupabaseRpc.mockResolvedValue({ data: null, error: null } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      await act(async () => {
        await result.current.setVisibility(action as any);
      });

      expect(mockSupabaseRpc).toHaveBeenCalledWith('set_global_visibility', expectedParams);
    });

    it('returns { error: null } on success', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: null, error: null } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      let response: { error: string | null } | null = null;
      await act(async () => {
        response = await result.current.setVisibility('1h');
      });

      expect(response).toEqual({ error: null });
    });

    it('calls refetch on success', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: null, error: null } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      await act(async () => {
        await result.current.setVisibility('1h');
      });

      expect(mockRefetch).toHaveBeenCalled();
    });

    it('sets error message on RPC failure', async () => {
      const error = new PostgrestError({
        message: 'Permission denied',
        details: '',
        hint: '',
        code: 'PGRST403',
      });
      mockSupabaseRpc.mockResolvedValue({ data: null, error } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      await act(async () => {
        await result.current.setVisibility('1h');
      });

      expect(result.current.setErrorMessage).toBe('Permission denied');
    });

    it('returns error message on RPC failure', async () => {
      const error = new PostgrestError({
        message: 'Permission denied',
        details: '',
        hint: '',
        code: 'PGRST403',
      });
      mockSupabaseRpc.mockResolvedValue({ data: null, error } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      let response: { error: string | null } | null = null;
      await act(async () => {
        response = await result.current.setVisibility('1h');
      });

      expect(response).toEqual({ error: 'Permission denied' });
    });

    it('does not call refetch on RPC failure', async () => {
      const error = new PostgrestError({
        message: 'Permission denied',
        details: '',
        hint: '',
        code: 'PGRST403',
      });
      mockSupabaseRpc.mockResolvedValue({ data: null, error } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      await act(async () => {
        await result.current.setVisibility('1h');
      });

      expect(mockRefetch).not.toHaveBeenCalled();
    });
  });

  describe('setting flag', () => {
    it('starts with setting=false', async () => {
      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      expect(result.current.setting).toBe(false);
    });

    it('clears setting=false after successful RPC', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: null, error: null } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      await act(async () => {
        await result.current.setVisibility('1h');
      });

      expect(result.current.setting).toBe(false);
    });

    it('clears setting=false after failed RPC', async () => {
      const error = new PostgrestError({
        message: 'Error',
        details: '',
        hint: '',
        code: 'ERR',
      });
      mockSupabaseRpc.mockResolvedValue({ data: null, error } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      await act(async () => {
        await result.current.setVisibility('1h');
      });

      expect(result.current.setting).toBe(false);
    });
  });

  describe('error message management', () => {
    it('starts with setErrorMessage=null', async () => {
      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      expect(result.current.setErrorMessage).toBeNull();
    });

    it('clears error message on subsequent successful call', async () => {
      const error = new PostgrestError({
        message: 'First error',
        details: '',
        hint: '',
        code: 'ERR1',
      });
      mockSupabaseRpc.mockResolvedValueOnce({ data: null, error } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      await act(async () => {
        await result.current.setVisibility('1h');
      });

      expect(result.current.setErrorMessage).toBe('First error');

      // Successful call
      mockSupabaseRpc.mockResolvedValueOnce({ data: null, error: null } as any);

      await act(async () => {
        await result.current.setVisibility('2h');
      });

      expect(result.current.setErrorMessage).toBeNull();
    });

    it('updates error message on subsequent failed call', async () => {
      const error1 = new PostgrestError({
        message: 'First error',
        details: '',
        hint: '',
        code: 'ERR1',
      });
      mockSupabaseRpc.mockResolvedValueOnce({ data: null, error: error1 } as any);

      const { result } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      await act(async () => {
        await result.current.setVisibility('1h');
      });

      expect(result.current.setErrorMessage).toBe('First error');

      // Another error
      const error2 = new PostgrestError({
        message: 'Second error',
        details: '',
        hint: '',
        code: 'ERR2',
      });
      mockSupabaseRpc.mockResolvedValueOnce({ data: null, error: error2 } as any);

      await act(async () => {
        await result.current.setVisibility('2h');
      });

      expect(result.current.setErrorMessage).toBe('Second error');
    });
  });

  describe('unmounted component handling', () => {
    it('does not update state after unmount', async () => {
      mockSupabaseRpc.mockResolvedValue({ data: null, error: null } as any);

      const { result, unmount } = await renderHook(() => useSetGlobalVisibility(mockRefetch));

      unmount();

      // Attempting to set visibility after unmount should not error
      let response: { error: string | null } | null = null;
      await act(async () => {
        response = await result.current.setVisibility('1h');
      });

      expect(response).toEqual({ error: null });
    });
  });
});
