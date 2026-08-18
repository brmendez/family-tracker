// app/(app)/groups/_layout.tsx
import { Stack } from 'expo-router';

/**
 * FT-9: nested Stack for the groups route, needed now that it has two
 * screens (list + detail) instead of one. Each screen owns its own
 * header/title; the parent (app)/_layout.tsx just hosts this navigator.
 */
const GroupsLayout = () => {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'Groups' }} />
      <Stack.Screen name="[id]" options={{ title: 'Group' }} />
    </Stack>
  );
};

export default GroupsLayout;
