// app/(app)/places/_layout.tsx
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

/**
 * FT-14 piece 1: nested Stack for the new "Places" flow, presented as a
 * modal over the map (see app/(app)/_layout.tsx's "places" Stack.Screen
 * entry, where the presentation: 'modal' option actually lives per
 * native-stack semantics). "index" needs its own close button since a
 * modal's root screen has no back history to pop to.
 */
const PlacesLayout = () => {
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
        options={{ title: 'Zones', headerLeft: renderCloseButton }}
      />
      <Stack.Screen name="new" options={{ title: 'Add Zone' }} />
      <Stack.Screen name="[placeId]" options={{ title: 'Edit Zone' }} />
    </Stack>
  );
};

export default PlacesLayout;

const styles = StyleSheet.create({
  headerButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
});
