// features/map/hooks/useOtherProfile.test.ts
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useAuth } from '../../../context/auth.context';
import { supabase } from '../../../lib/supabase';
import { useOtherProfile } from './useOtherProfile';

jest.mock('../../../context/auth.context');
jest.mock('../../../lib/supabase');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockSupabaseFrom = supabase.from as jest.MockedFunction<typeof supabase.from>;

const createMockSelectChain = (
  data: Array<{ id: string; display_name: string; avatar_color: string | null }> = [],
  error: { message: string } | null = null,
) => {
  return {
    select: jest.fn().mockReturnValue({
      neq: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
};

describe('useOtherProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: null,
      userId: 'test-user-id',
      profile: null,
      loading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    });
  });

  it('resolves the other profile when exactly one other profiles row exists', async () => {
    const otherProfileData = [
      {
        id: 'other-user-id',
        display_name: 'Alice',
        avatar_color: '#FF5733',
      },
    ];
    const mockSelectChain = createMockSelectChain(otherProfileData);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherProfile());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.otherProfile).toEqual({
      id: 'other-user-id',
      displayName: 'Alice',
      avatarColor: '#FF5733',
    });
    expect(result.current.errorMessage).toBeNull();
  });

  it('returns null when zero other profiles exist (valid v1 state)', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherProfile());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.otherProfile).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('maps snake_case database fields to camelCase', async () => {
    const otherProfileData = [
      {
        id: 'other-user-id',
        display_name: 'Bob',
        avatar_color: '#00FF00',
      },
    ];
    const mockSelectChain = createMockSelectChain(otherProfileData);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherProfile());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.otherProfile).toEqual({
      id: 'other-user-id',
      displayName: 'Bob',
      avatarColor: '#00FF00',
    });
  });

  it('handles null avatarColor', async () => {
    const otherProfileData = [
      {
        id: 'other-user-id',
        display_name: 'Charlie',
        avatar_color: null,
      },
    ];
    const mockSelectChain = createMockSelectChain(otherProfileData);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherProfile());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.otherProfile?.avatarColor).toBeNull();
  });

  it('queries with correct filter (neq id and limit 1)', async () => {
    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    await renderHook(() => useOtherProfile());

    await waitFor(() => {
      expect(mockSupabaseFrom).toHaveBeenCalledWith('profiles');
    });

    const selectChain = mockSelectChain.select;
    expect(selectChain).toHaveBeenCalledWith('id, display_name, avatar_color');

    const neqChain = selectChain.mock.results[0].value;
    expect(neqChain.neq).toHaveBeenCalledWith('id', 'test-user-id');

    const limitChain = neqChain.neq.mock.results[0].value;
    expect(limitChain.limit).toHaveBeenCalledWith(1);
  });

  it('does not load when userId is null', async () => {
    mockUseAuth.mockReturnValue({
      session: null,
      userId: null,
      profile: null,
      loading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    });

    const mockSelectChain = createMockSelectChain([]);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherProfile());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockSupabaseFrom).not.toHaveBeenCalled();
    expect(result.current.otherProfile).toBeNull();
  });

  it('surfaces a query error via errorMessage without throwing', async () => {
    const errorMessage = 'Database connection failed';
    const mockSelectChain = createMockSelectChain([], { message: errorMessage });
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result } = await renderHook(() => useOtherProfile());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.errorMessage).toBe(errorMessage);
    expect(result.current.otherProfile).toBeNull();
  });

  it('does not update state after unmount (isCancelled guard)', async () => {
    let resolveQuery: (value: unknown) => void;
    const queryPromise = new Promise((resolve) => {
      resolveQuery = resolve;
    });

    const mockSelectChain = {
      select: jest.fn().mockReturnValue({
        neq: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue(queryPromise),
        }),
      }),
    };
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result, unmount } = await renderHook(() => useOtherProfile());

    // Unmount before the query resolves
    await act(async () => {
      unmount();
    });

    // Now resolve the query — this should be ignored due to isCancelled guard
    await act(async () => {
      resolveQuery({
        data: [
          {
            id: 'other-user-id',
            display_name: 'Too Late',
            avatar_color: null,
          },
        ],
        error: null,
      });
    });

    // Component is already unmounted, so the late-arriving data must not
    // reach state — result.current stays frozen at its pre-unmount value.
    expect(result.current.otherProfile).toBeNull();
  });

  it('refetches when userId changes', async () => {
    const user1ProfileData = [
      {
        id: 'other-user-for-user1',
        display_name: 'OtherForUser1',
        avatar_color: '#FF0000',
      },
    ];
    const mockSelectChain = createMockSelectChain(user1ProfileData);
    mockSupabaseFrom.mockReturnValue(mockSelectChain as unknown as ReturnType<typeof supabase.from>);

    const { result, rerender } = await renderHook(
      () => useOtherProfile(),
      {
        initialProps: undefined,
      },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.otherProfile?.displayName).toBe('OtherForUser1');

    // Change userId
    mockUseAuth.mockReturnValue({
      session: null,
      userId: 'new-user-id',
      profile: null,
      loading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    });

    const user2ProfileData = [
      {
        id: 'other-user-for-user2',
        display_name: 'OtherForUser2',
        avatar_color: '#00FF00',
      },
    ];
    const mockSelectChain2 = createMockSelectChain(user2ProfileData);
    mockSupabaseFrom.mockReturnValue(
      mockSelectChain2 as unknown as ReturnType<typeof supabase.from>,
    );

    await act(async () => {
      rerender(undefined);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify the query was called with the new userId
    const selectChain = mockSelectChain2.select;
    const neqChain = selectChain.mock.results[selectChain.mock.results.length - 1].value;
    expect(neqChain.neq).toHaveBeenCalledWith('id', 'new-user-id');

    expect(result.current.otherProfile?.displayName).toBe('OtherForUser2');
  });
});
