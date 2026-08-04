// jest.setup.ts
// Any module that transitively imports lib/supabase.ts (session persistence)
// needs AsyncStorage mocked, or tests crash on load with a native-module
// error rather than a useful test failure. Applied globally so individual
// test files don't need to remember it.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
