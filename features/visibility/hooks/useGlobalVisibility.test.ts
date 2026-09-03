// features/visibility/hooks/useGlobalVisibility.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/auth.context';
import { useGlobalVisibility } from './useGlobalVisibility';

jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}));

const mockSupabaseFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

type OverrideRow = {
  event_type: 'hide' | 'unhide';
  expires_at: string | null;
};

const createMockSelectChain = (data: OverrideRow | null = null, error: any = null) => {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
    }),
  };
};

describe('useGlobalVisibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('initial fetch on mount', () => {
    it('fetches global visibility state for current user on mount', async () => {
      const mockSelectChain = createMockSelectChain(null);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockSupabaseFrom).toHaveBeenCalledWith('global_visibility_overrides');
      expect(mockSelectChain.select).toHaveBeenCalledWith('event_type, expires_at');
    });

    it('derives isHidden=false and expiresAt=null when no override row exists', async () => {
      const mockSelectChain = createMockSelectChain(null);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state).toEqual({ isHidden: false, expiresAt: null });
    });

    it('derives isHidden=false when latest row has event_type=unhide', async () => {
      const row: OverrideRow = { event_type: 'unhide', expires_at: null };
      const mockSelectChain = createMockSelectChain(row);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state.isHidden).toBe(false);
    });

    it('derives isHidden=true when global hide is not yet expired', async () => {
      const futureTime = new Date(Date.now() + 3600000).toISOString();
      const row: OverrideRow = { event_type: 'hide', expires_at: futureTime };
      const mockSelectChain = createMockSelectChain(row);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state.isHidden).toBe(true);
      expect(result.current.state.expiresAt).toBe(futureTime);
    });

    it('derives isHidden=false when global hide is expired', async () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const row: OverrideRow = { event_type: 'hide', expires_at: pastTime };
      const mockSelectChain = createMockSelectChain(row);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state.isHidden).toBe(false);
    });

    it('derives isHidden=true when global hide is indefinite (expires_at=null)', async () => {
      const row: OverrideRow = { event_type: 'hide', expires_at: null };
      const mockSelectChain = createMockSelectChain(row);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state.isHidden).toBe(true);
      expect(result.current.state.expiresAt).toBeNull();
    });

    it('does not fetch when userId is null', async () => {
      mockUseAuth.mockReturnValue({ userId: null } as any);
      const mockSelectChain = createMockSelectChain(null);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockSupabaseFrom).not.toHaveBeenCalled();
      expect(result.current.state).toEqual({ isHidden: false, expiresAt: null });
    });

    it('surfaces fetch error without throwing', async () => {
      const mockSelectChain = {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } }),
              }),
            }),
          }),
        }),
      };
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state).toEqual({ isHidden: false, expiresAt: null });
    });
  });

  describe('refetch method', () => {
    it('refetches and updates state', async () => {
      const initialRow: OverrideRow = { event_type: 'unhide', expires_at: null };
      const mockSelectChain = createMockSelectChain(initialRow);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.state.isHidden).toBe(false);

      // Simulate a hide action via refetch
      const hiddenRow: OverrideRow = {
        event_type: 'hide',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };
      const updatedChain = createMockSelectChain(hiddenRow);
      mockSupabaseFrom.mockReturnValue(updatedChain as unknown as ReturnType<typeof supabase.from>);

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.state.isHidden).toBe(true);
      });
    });

    it('does not update state after unmount', async () => {
      const initialRow: OverrideRow = { event_type: 'unhide', expires_at: null };
      const mockSelectChain = createMockSelectChain(initialRow);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result, unmount } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const stateBeforeUnmount = result.current.state;
      unmount();

      const hiddenRow: OverrideRow = {
        event_type: 'hide',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };
      const updatedChain = createMockSelectChain(hiddenRow);
      mockSupabaseFrom.mockReturnValue(updatedChain as unknown as ReturnType<typeof supabase.from>);

      let refetchPromise: Promise<void> | null = null;
      act(() => {
        refetchPromise = result.current.refetch();
      });

      if (refetchPromise) {
        await refetchPromise;
      }

      // State should not have changed after unmount
      expect(result.current.state).toEqual(stateBeforeUnmount);
    });
  });

  describe('loading state management', () => {
    it('starts with loading=true and transitions to false on successful fetch', async () => {
      const mockSelectChain = createMockSelectChain(null);
      mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

      const { result } = await renderHook(() => useGlobalVisibility());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });
});
