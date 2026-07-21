// context/auth.context.tsx
import type { AuthSession as Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '../lib/supabase';

export type Profile = {
  id: string;
  display_name: string;
  avatar_color: string | null;
  created_at: string;
};

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  userId: string | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore any persisted session on launch, then keep in sync with
  // sign-in/sign-out/token-refresh events for the rest of the app's life.
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Fetch the profiles row for whoever is currently signed in.
  useEffect(() => {
    const userId = session?.user.id;

    if (!userId) {
      setProfile(null);
      return;
    }

    // Prevent the risk of calling setProfile(data) with a result from a previous user's query, or on an unmounted component
    let isCancelled = false;

    supabase
      .from('profiles')
      .select('id, display_name, avatar_color, created_at')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (isCancelled) {
          return;
        }
        if (error) {
          console.warn('[auth] failed to load profile:', error.message);
          setProfile(null);
          return;
        }

        setProfile(data);
      });

    return () => {
      isCancelled = true;
    };
  }, [session?.user.id]);

  const signUp = async (
    email: string,
    password: string,
  ): Promise<AuthResult> => {
    const { error } = await supabase.auth.signUp({ email, password });

    return { error: error?.message ?? null };
  };

  const signIn = async (
    email: string,
    password: string,
  ): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      profile,
      loading,
      signUp,
      signIn,
      signOut,
    }),
    [session, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
