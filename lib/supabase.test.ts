// lib/supabase.test.ts
// lib/supabase.ts validates its required env vars in a module-level guard
// that throws at import time (see the file for why this isn't extracted
// into a pure function). To exercise all four combinations of
// EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY, each test
// resets the module registry and re-requires the module fresh after
// setting up its own env, so the top-level guard re-runs every time.
// (require(), not a dynamic import(), because the CJS transform used by
// this project's Jest config doesn't support real dynamic import().)

const ORIGINAL_ENV = process.env;

const VALID_URL = 'https://example.supabase.co';
const VALID_ANON_KEY = 'test-anon-key';

describe('lib/supabase', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('creates a defined supabase client when both env vars are present', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = VALID_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = VALID_ANON_KEY;

    const { supabase } = require('./supabase');

    expect(supabase).toBeDefined();
    expect(supabase.auth).toBeDefined();
  });

  it('throws when EXPO_PUBLIC_SUPABASE_URL is missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = VALID_ANON_KEY;

    expect(() => require('./supabase')).toThrow(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY',
    );
  });

  it('throws when EXPO_PUBLIC_SUPABASE_ANON_KEY is missing', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = VALID_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => require('./supabase')).toThrow(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY',
    );
  });

  it('throws when both env vars are missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => require('./supabase')).toThrow(
      'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY',
    );
  });
});
