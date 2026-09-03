// features/visibility/components/VisibilityDurationSheet.tsx
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { VisibilityDuration } from '../types/visibility.types';

type VisibilityDurationSheetProps = {
  visible: boolean;
  isHidden: boolean;
  setting: boolean;
  errorMessage: string | null;
  onSelectDuration: (duration: VisibilityDuration) => void;
  onUnhide: () => void;
  onClose: () => void;
};

const DURATION_OPTIONS: { value: VisibilityDuration; label: string }[] = [
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '4h', label: '4 hours' },
  { value: 'allDay', label: 'All day' },
  { value: 'indefinite', label: 'Until I turn it back on' },
];

// Local modal state owned by FamilyMap.tsx, not a route — same reasoning
// as MapLocationPicker's picker modal (no way to return a value from a
// pushed screen). Offers durations when visible, or a single "unhide"
// option when already hidden for the active group.
export const VisibilityDurationSheet = ({
  visible,
  isHidden,
  setting,
  errorMessage,
  onSelectDuration,
  onUnhide,
  onClose,
}: VisibilityDurationSheetProps) => (
  <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <View style={styles.sheet}>
        {setting ? <ActivityIndicator style={styles.spinner} /> : null}
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {isHidden ? (
          <Pressable
            style={[styles.option, setting && styles.optionDisabled]}
            onPress={onUnhide}
            disabled={setting}
          >
            <Text style={styles.optionText}>Visible again now</Text>
          </Pressable>
        ) : (
          DURATION_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.option, setting && styles.optionDisabled]}
              onPress={() => onSelectDuration(option.value)}
              disabled={setting}
            >
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          ))
        )}
      </View>
    </Pressable>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 8,
    paddingBottom: 24,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionText: {
    fontSize: 16,
    color: '#111',
  },
  spinner: {
    marginTop: 12,
  },
  error: {
    color: '#c0392b',
    fontSize: 14,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
