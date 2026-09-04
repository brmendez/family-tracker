// app/(app)/history/_layout.tsx
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

// FT-22: nested Stack for the History flow, mirrors places/_layout.tsx.
// Presented as a modal (see app/(app)/_layout.tsx's "history" Stack.Screen
// entry, where presentation: 'modal' actually lives per native-stack
// semantics) — "index" needs its own close button, same reason as Places.
//
// FT-23: adds "playback", same close-button convention as "index".
const HistoryLayout = () => {
  const router = useRouter();

  const renderCloseButton = () => (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <Text style={styles.headerButtonText}>Close</Text>
    </Pressable>
  );

  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="index"
        options={{ title: 'History', headerLeft: renderCloseButton }}
      />
      <Stack.Screen
        name="playback"
        options={{ title: 'Playback', headerLeft: renderCloseButton }}
      />
    </Stack>
  );
};

export default HistoryLayout;

const styles = StyleSheet.create({
  headerButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
});
