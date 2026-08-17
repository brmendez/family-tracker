// app/(app)/_layout.tsx
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

/**
 * FT-8: route group for the signed-in app, mirroring (auth)'s layout
 * shape. headerShown: false is the default (same as (auth)), with two
 * explicit per-screen overrides: the map (index) screen gets a header
 * with a "Groups" button, and the groups screen gets a header with a
 * title, relying on the Stack's default back button to return to map.
 */
const AppLayout = () => {
  const router = useRouter();

  const renderGroupsButton = () => (
    <Pressable onPress={() => router.push('/groups')} hitSlop={8}>
      <Text style={styles.headerButtonText}>Groups</Text>
    </Pressable>
  );

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerRight: renderGroupsButton,
        }}
      />
      <Stack.Screen
        name="groups"
        options={{
          headerShown: true,
          title: 'Groups',
        }}
      />
    </Stack>
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
