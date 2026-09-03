// features/visibility/components/VisibilityToggleButton.tsx
import { Pressable, StyleSheet, Text } from 'react-native';

type VisibilityToggleButtonProps = {
  isHidden: boolean;
  onPress: () => void;
};

// Text label, not an icon — no icon library (@expo/vector-icons or
// otherwise) is a dependency of this project yet, and this ticket doesn't
// warrant adding one for a single button. Mirrors the Zones button's
// placement/style; label reflects useGroupVisibility's current state.
export const VisibilityToggleButton = ({
  isHidden,
  onPress,
}: VisibilityToggleButtonProps) => (
  <Pressable
    style={styles.button}
    onPress={onPress}
    accessibilityLabel={isHidden ? 'Hidden from this group' : 'Visible to this group'}
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
