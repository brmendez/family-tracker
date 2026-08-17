// lib/__mocks__/supabase.ts
/**
 * Manual mock, picked up automatically by any test file that calls
 * jest.mock('.../lib/supabase') with no factory. Only the client methods
 * exercised somewhere in the test suite are stubbed here; each test
 * configures return values on top, e.g.
 * supabase.auth.getSession.mockResolvedValue(...), supabase.from.mockReturnValue(...).
 */
export const supabase = {
  auth: {
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(),
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
  },
  from: jest.fn(),
  rpc: jest.fn(),
  channel: jest.fn(),
  removeChannel: jest.fn(),
};
