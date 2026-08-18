// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // FT-9: GroupsScreen now imports useRouter from expo-router, which
  // pulls in standard-navigation — not covered by the prior pattern, so
  // its ESM source hit Jest untransformed. Added standard-navigation
  // (matches jest-expo's own recommended pattern) alongside the existing entries.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|standard-navigation)',
  ],
};
