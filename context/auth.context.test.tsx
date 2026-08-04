// context/auth.context.test.tsx
import { act, renderHook } from '@testing-library/react-native';
import {
  AuthError,
  PostgrestError,
  type AuthChangeEvent,
  type AuthSession as Session,
  type User,
} from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

import { AuthProvider, useAuth, type Profile } from './auth.context';

// supabase is imported directly (not injected) by auth.context.tsx, so it's
// mocked at the module boundary. Each auth/query method is driven
// independently per test via the typed handles below. jest.mock calls are
// hoisted above these imports by babel-jest, so the mock is in place before
// auth.context.tsx (or this file) ever touches the real client.
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn(),
  },
}));

type GetSessionResult = {
  data: { session: Session | null };
  error: AuthError | null;
};
type ProfileQueryResult = {
  data: Profile | null;
  error: PostgrestError | null;
};
type AuthChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null,
) => void;

// supabase.auth's real return type is a discriminated union keyed on
// error/session presence, which is awkward to express as a mock's static
// return type. Casting through `unknown` swaps in a simpler shape while
// still using the real AuthError/PostgrestError/AuthChangeEvent types below,
// rather than `any` or hand-rolled error shapes that could drift from the
// library's actual types.
const mockedAuth = supabase.auth as unknown as {
  getSession: jest.Mock<Promise<GetSessionResult>, []>;
  onAuthStateChange: jest.Mock;
  signUp: jest.Mock;
  signInWithPassword: jest.Mock;
  signOut: jest.Mock;
};
const mockedFrom = supabase.from as unknown as jest.Mock;

const createUser = (id: string): User => ({
  id,
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
});

const createSession = (userId: string): Session => ({
  access_token: `access-${userId}`,
  refresh_token: `refresh-${userId}`,
  expires_in: 3600,
  token_type: 'bearer',
  user: createUser(userId),
});

const createProfile = (userId: string, displayName: string): Profile => ({
  id: userId,
  display_name: displayName,
  avatar_color: null,
  created_at: '2024-01-01T00:00:00.000Z',
});

// Default: subscribe successfully, never emit any additional events unless
// the test explicitly fires one. Most tests don't care about the
// INITIAL_SESSION race and just need a stable, inert subscription.
const mockAuthStateChangeInert = () => {
  const unsubscribe = jest.fn();
  mockedAuth.onAuthStateChange.mockImplementation(() => ({
    data: { subscription: { unsubscribe } },
  }));
  return { unsubscribe };
};

// Simulates real supabase-js v2 behavior: onAuthStateChange fires an
// INITIAL_SESSION event asynchronously (microtask) shortly after
// subscribing, racing against the awaited getSession() call in
// restoreSession. Also exposes fireEvent so a test can push further
// events (e.g. a user switch) through the same listener.
const mockAuthStateChangeWithInitialSession = (
  initialSession: Session | null,
) => {
  const unsubscribe = jest.fn();
  let capturedCallback: AuthChangeCallback | null = null;

  mockedAuth.onAuthStateChange.mockImplementation(
    (callback: AuthChangeCallback) => {
      capturedCallback = callback;
      Promise.resolve().then(() => callback('INITIAL_SESSION', initialSession));

      return { data: { subscription: { unsubscribe } } };
    },
  );

  return {
    unsubscribe,
    fireEvent: (event: AuthChangeEvent, session: Session | null) => {
      capturedCallback?.(event, session);
    },
  };
};

const mockProfileQuery = (result: ProfileQueryResult) => {
  const single = jest.fn().mockResolvedValue(result);
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));

  mockedFrom.mockReturnValueOnce({ select });

  return { select, eq, single };
};

const mockProfileQueryDeferred = () => {
  let resolveFn!: (result: ProfileQueryResult) => void;
  const promise = new Promise<ProfileQueryResult>((resolve) => {
    resolveFn = resolve;
  });
  const single = jest.fn(() => promise);
  const eq = jest.fn(() => ({ single }));
  const select = jest.fn(() => ({ eq }));

  mockedFrom.mockReturnValueOnce({ select });

  return { resolve: resolveFn };
};

// Session restore and the profile-fetch effect both settle over a couple of
// microtask ticks. Flushing twice keeps assertions stable regardless of
// which of getSession()/onAuthStateChange's INITIAL_SESSION resolves first.
const flush = async () => {
  await act(async () => {});
  await act(async () => {});
};

const renderAuth = () => renderHook(() => useAuth(), { wrapper: AuthProvider });

let warnSpy: jest.SpiedFunction<typeof console.warn>;

beforeEach(() => {
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('AuthProvider session restore', () => {
  it('restores a persisted session on mount and exposes it via useAuth', async () => {
    const session = createSession('user-1');

    mockedAuth.getSession.mockResolvedValue({ data: { session }, error: null });
    mockAuthStateChangeWithInitialSession(session);
    mockProfileQuery({ data: null, error: null });

    const { result } = await renderAuth();
    await flush();

    expect(result.current?.session).toEqual(session);
    expect(result.current?.userId).toBe('user-1');
  });

  it('starts loading as true and flips to false once session restore resolves', async () => {
    let resolveGetSession!: (value: GetSessionResult) => void;
    const pending = new Promise<GetSessionResult>((resolve) => {
      resolveGetSession = resolve;
    });

    mockedAuth.getSession.mockReturnValue(pending);
    mockAuthStateChangeInert();

    const { result } = await renderAuth();

    expect(result.current?.loading).toBe(true);

    await act(async () => {
      resolveGetSession({ data: { session: null }, error: null });
      await pending;
    });
    await flush();

    expect(result.current?.loading).toBe(false);
  });

  it('logs a getSession() error via console.warn but still sets session and loading', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthError('network unreachable'),
    });
    mockAuthStateChangeInert();

    const { result } = await renderAuth();
    await flush();

    expect(warnSpy).toHaveBeenCalledWith(
      '[auth] failed to restore session:',
      'network unreachable',
    );
    expect(result.current?.session).toBeNull();
    expect(result.current?.loading).toBe(false);
  });

  it('does not update state after unmount, and unsubscribes the auth listener on cleanup', async () => {
    let resolveGetSession!: (value: GetSessionResult) => void;
    const pending = new Promise<GetSessionResult>((resolve) => {
      resolveGetSession = resolve;
    });

    mockedAuth.getSession.mockReturnValue(pending);
    const { unsubscribe } = mockAuthStateChangeInert();

    const { unmount } = await renderAuth();

    await unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);

    // Resolving after unmount must not throw (the isMounted guard should
    // stop the effect from calling setState on an unmounted component).
    await expect(
      act(async () => {
        resolveGetSession({
          data: { session: createSession('late-user') },
          error: null,
        });
        await pending;
      }),
    ).resolves.not.toThrow();
  });
});

describe('AuthProvider profile fetch', () => {
  it('fetches and exposes the profile once signed in', async () => {
    const session = createSession('user-1');
    const profile = createProfile('user-1', 'Ada');

    mockedAuth.getSession.mockResolvedValue({ data: { session }, error: null });
    mockAuthStateChangeInert();
    mockProfileQuery({ data: profile, error: null });

    const { result } = await renderAuth();
    await flush();

    expect(result.current?.profile).toEqual(profile);
  });

  it('has no profile query in flight and a null profile when signed out', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockAuthStateChangeInert();

    const { result } = await renderAuth();
    await flush();

    expect(mockedFrom).not.toHaveBeenCalled();
    expect(result.current?.profile).toBeNull();
  });

  it('logs a profile-fetch error via console.warn and leaves profile null', async () => {
    const session = createSession('user-1');

    mockedAuth.getSession.mockResolvedValue({ data: { session }, error: null });
    mockAuthStateChangeInert();
    mockProfileQuery({
      data: null,
      error: new PostgrestError({
        message: 'row not found',
        details: '',
        hint: '',
        code: 'PGRST116',
      }),
    });

    const { result } = await renderAuth();
    await flush();

    expect(warnSpy).toHaveBeenCalledWith(
      '[auth] failed to load profile:',
      'row not found',
    );
    expect(result.current?.profile).toBeNull();
  });

  it('ignores a stale profile response for the previous user after switching users mid-flight', async () => {
    const sessionA = createSession('user-a');
    const sessionB = createSession('user-b');
    const profileB = createProfile('user-b', 'Bea');

    mockedAuth.getSession.mockResolvedValue({
      data: { session: sessionA },
      error: null,
    });
    const { fireEvent } = mockAuthStateChangeWithInitialSession(sessionA);

    const deferredA = mockProfileQueryDeferred();

    const { result } = await renderAuth();
    await flush();

    expect(result.current?.session?.user.id).toBe('user-a');

    // Switch to user B before user A's profile query has resolved. This
    // triggers the profile-fetch effect's cleanup (isCancelled = true) for
    // user A's still-pending request.
    mockProfileQuery({ data: profileB, error: null });
    await act(async () => {
      fireEvent('SIGNED_IN', sessionB);
    });
    await flush();

    expect(result.current?.session?.user.id).toBe('user-b');
    expect(result.current?.profile).toEqual(profileB);

    // Now resolve user A's stale query. Because that effect run was
    // cancelled, its result must not overwrite user B's profile.
    await act(async () => {
      deferredA.resolve({ data: createProfile('user-a', 'Ada'), error: null });
      await Promise.resolve();
    });
    await flush();

    expect(result.current?.profile).toEqual(profileB);
  });
});

describe('AuthProvider signUp/signIn/signOut', () => {
  it('signUp returns { error: null } on success', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockAuthStateChangeInert();
    mockedAuth.signUp.mockResolvedValue({ data: {}, error: null });

    const { result } = await renderAuth();
    await flush();

    const response = await result.current!.signUp(
      'new@example.com',
      'password123',
    );

    expect(response).toEqual({ error: null });
    expect(mockedAuth.signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
    });
  });

  it('signUp returns { error: message } on failure', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockAuthStateChangeInert();
    mockedAuth.signUp.mockResolvedValue({
      data: {},
      error: new AuthError('email already registered'),
    });

    const { result } = await renderAuth();
    await flush();

    const response = await result.current!.signUp(
      'taken@example.com',
      'password123',
    );

    expect(response).toEqual({ error: 'email already registered' });
  });

  it('signIn returns { error: null } on success', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockAuthStateChangeInert();
    mockedAuth.signInWithPassword.mockResolvedValue({ data: {}, error: null });

    const { result } = await renderAuth();
    await flush();

    const response = await result.current!.signIn(
      'user@example.com',
      'password123',
    );

    expect(response).toEqual({ error: null });
    expect(mockedAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password123',
    });
  });

  it('signIn returns { error: message } on failure', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockAuthStateChangeInert();
    mockedAuth.signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthError('invalid credentials'),
    });

    const { result } = await renderAuth();
    await flush();

    const response = await result.current!.signIn(
      'user@example.com',
      'wrong-password',
    );

    expect(response).toEqual({ error: 'invalid credentials' });
  });

  it('signOut calls supabase.auth.signOut()', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockAuthStateChangeInert();
    mockedAuth.signOut.mockResolvedValue({ error: null });

    const { result } = await renderAuth();
    await flush();

    await result.current!.signOut();

    expect(mockedAuth.signOut).toHaveBeenCalledTimes(1);
  });
});

describe('AuthProvider context value stability', () => {
  it('keeps the same context value reference across re-renders when session/profile/loading are unchanged', async () => {
    mockedAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockAuthStateChangeInert();

    const { result, rerender } = await renderAuth();
    await flush();

    const firstValue = result.current;

    await rerender(undefined);
    await flush();

    expect(result.current).toBe(firstValue);
  });
});

describe('useAuth outside of a provider', () => {
  it('throws when called without an AuthProvider ancestor', async () => {
    await expect(renderHook(() => useAuth())).rejects.toThrow(
      'useAuth must be used within an AuthProvider',
    );
  });
});
