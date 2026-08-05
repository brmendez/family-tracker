// test/utils.ts
/**
 * Shared test-support code used across 2+ test files. Lives outside
 * __tests__/ deliberately: Jest's default testMatch treats every file
 * inside a __tests__ directory as a test suite to run, regardless of name,
 * so a plain helper module in there would fail with "must contain at least
 * one test."
 */
import { act } from '@testing-library/react-native';
import type { AuthSession as Session, User } from '@supabase/supabase-js';

import type { Profile } from '../context/auth.context';

export const createUser = (id: string): User => ({
  id,
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00.000Z',
});

export const createSession = (userId: string): Session => ({
  access_token: `access-${userId}`,
  refresh_token: `refresh-${userId}`,
  expires_in: 3600,
  token_type: 'bearer',
  user: createUser(userId),
});

export const createProfile = (
  userId: string,
  displayName: string,
): Profile => ({
  id: userId,
  display_name: displayName,
  avatar_color: null,
  created_at: '2024-01-01T00:00:00.000Z',
});

/**
 * Effects that settle over more than one microtask tick (e.g. an awaited
 * Supabase call racing an onAuthStateChange listener's async emission) need
 * more than one act() flush to land. Flushing twice keeps assertions stable
 * regardless of which async source resolves first.
 */
export const flush = async () => {
  await act(async () => {});
  await act(async () => {});
};
