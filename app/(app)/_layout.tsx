// app/(app)/_layout.tsx
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { GroupsProvider } from '../../context/groups.context';
import { NotificationsProvider } from '../../context/notifications.context';

/**
 * FT-8: route group for the signed-in app, mirroring (auth)'s layout
 * shape. headerShown: false is the default (same as (auth)); the map
 * (index) screen overrides it for a header with a "Groups" button. The
 * groups screen is its own nested Stack as of FT-9 (see
 * groups/_layout.tsx) since it now has list + detail screens, so it's
 * left at the default here and owns its own headers.
 *
 * FT-12: wraps the Stack in GroupsProvider. Mounted here rather than the
 * root layout so it naturally remounts fresh on sign-out/sign-in via the
 * existing Stack.Protected swap — no manual reset logic needed.
 *
 * FT-14 redesign, piece 1: adds a "places" screen, presented as a modal
 * (native-stack's presentation option lives on the Screen entry in the
 * navigator that performs the push, not in the nested layout itself) so
 * it overlays the map instead of replacing it.
 *
 * FT-15: wraps in NotificationsProvider, which invokes
 * usePushRegistration() once so permission is requested and the
 * device's push token registered on first authenticated load. Screens
 * that need pushPermissionStatus (currently GroupsScreen) read it from
 * that context rather than calling the hook again.
 */
const AppLayout = () => {
  const router = useRouter();

  const renderGroupsButton = () => (
    <Pressable onPress={() => router.push('/groups')} hitSlop={8}>
      <Text style={styles.headerButtonText}>Groups</Text>
    </Pressable>
  );

  return (
    <NotificationsProvider>
      <GroupsProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="index"
            options={{
              headerShown: true,
              headerRight: renderGroupsButton,
            }}
          />
          <Stack.Screen name="groups" />
          <Stack.Screen
            name="places"
            options={{ presentation: 'modal', headerShown: false }}
          />
        </Stack>
      </GroupsProvider>
    </NotificationsProvider>
  );
};

export default AppLayout;

const styles = StyleSheet.create({
  headerButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
});
