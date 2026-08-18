// app/(app)/groups/_layout.tsx
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

/**
 * FT-9: nested Stack for the groups route, needed now that it has two
 * screens (list + detail) instead of one. Each screen owns its own
 * header/title; the parent (app)/_layout.tsx just hosts this navigator.
 *
 * The "index" screen needs an explicit back button: as the root screen
 * of this nested Stack, it has no history within its own navigator, so
 * native-stack won't auto-show a back arrow even though the map screen
 * is one level up in the parent Stack.
 */
const GroupsLayout = () => {
  const router = useRouter();

  const renderBackButton = () => (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <Text style={styles.headerButtonText}>Map</Text>
    </Pressable>
  );

  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Groups', headerLeft: renderBackButton }} />
      <Stack.Screen name="[id]" options={{ title: 'Group' }} />
    </Stack>
  );
};

export default GroupsLayout;

const styles = StyleSheet.create({
  headerButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
});
