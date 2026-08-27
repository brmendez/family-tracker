// app/_layout.tsx
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '../context/auth.context';
import { handleNotification } from '../features/notifications/utils/notificationHandler';

// FT-15: Expo's default handler suppresses a push while the app is
// foregrounded — this makes one display as a banner instead. Config
// only, not tied to auth state, so it lives at module scope.
Notifications.setNotificationHandler({
  handleNotification,
});

const RootNavigator = () => {
  const { session, loading } = useAuth();

  // Session is still being restored from AsyncStorage — avoid flashing
  // either the signed-in or signed-out screens until we know which one.
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={session !== null}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={session === null}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
};

const RootLayout = () => {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </AuthProvider>
  );
};

export default RootLayout;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
