// features/visibility/components/VisibilityToggleButton.tsx
import { Pressable, StyleSheet, Text } from 'react-native';

type VisibilityToggleButtonProps = {
  isHidden: boolean;
  onPress: () => void;
  scope?: 'group' | 'global';
};

const SCOPE_LABEL: Record<'group' | 'global', string> = {
  group: 'this group',
  global: 'everyone',
};

// Text label, not an icon — no icon library (@expo/vector-icons or
// otherwise) is a dependency of this project yet, and this ticket doesn't
// warrant adding one for a single button. Mirrors the Zones button's
// placement/style; label reflects useGroupVisibility's current state.
export const VisibilityToggleButton = ({
  isHidden,
  onPress,
  scope = 'group',
}: VisibilityToggleButtonProps) => (
  <Pressable
    style={styles.button}
    onPress={onPress}
    accessibilityLabel={
      isHidden ? `Hidden from ${SCOPE_LABEL[scope]}` : `Visible to ${SCOPE_LABEL[scope]}`
    }
  >
    <Text style={styles.buttonText}>{isHidden ? 'Hidden' : 'Visible'}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginHorizontal: 12,
    marginBottom: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
