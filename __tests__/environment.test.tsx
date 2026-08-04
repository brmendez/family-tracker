// __tests__/environment.test.tsx
// Not a feature test — this validates the Jest setup itself (jest-expo
// preset, Babel/TS transform, React Native Testing Library, AsyncStorage
// mock). If this file fails, the problem is the test environment, not
// application code. Keep it minimal and stable.
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('test environment', () => {
  it('runs plain assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('renders a React Native component via Testing Library', async () => {
    await render(<Text>hello</Text>);

    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('has AsyncStorage mocked for anything that imports lib/supabase.ts', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');

    await AsyncStorage.setItem('test-key', 'test-value');

    expect(await AsyncStorage.getItem('test-key')).toBe('test-value');
  });
});
