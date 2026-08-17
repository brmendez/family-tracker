// features/groups/components/GroupsScreen.tsx
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useGroups } from '../hooks/useGroups';
import { CreateGroupForm } from './CreateGroupForm';

/**
 * FT-8: the first v2 screen — lets the signed-in user see the groups
 * they belong to and create a new one. Calls useGroups() once and passes
 * the results down as props to CreateGroupForm; no context, since the
 * group list has a single consumer here (GroupsProvider is deferred to
 * FT-12). Distinguishes an initial-loading spinner, a fetch-error state
 * with a retry action, an empty-list state, and the populated list —
 * a failed create only ever surfaces inline in CreateGroupForm, never
 * replacing an already-loaded list.
 *
 * Keyboard handling: `keyboardVerticalOffset` is measured rather than
 * hardcoded because the "Groups" route renders under a native Stack
 * header (see app/(app)/_layout.tsx), and KeyboardAvoidingView's
 * `padding` behavior only accounts for its own view bounds — it doesn't
 * know about the header sitting above it. `@react-navigation/elements`
 * (which normally provides `useHeaderHeight()` for this) isn't a
 * resolvable package in this SDK 57 setup — expo-router vendors it
 * internally under an unpublished path, so importing from it directly
 * would depend on expo-router's internals rather than a public API.
 * Measuring the root view's on-screen position via `measureInWindow`
 * gives the same value (the header height) without that dependency.
 */
export const GroupsScreen = () => {
  const {
    groups,
    loading,
    errorMessage,
    createGroup,
    creating,
    createErrorMessage,
    refetch,
  } = useGroups();

  const rootRef = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const showInitialSpinner = loading && groups.length === 0 && !errorMessage;

  const handleRootLayout = () => {
    rootRef.current?.measureInWindow((_x, y) => {
      setKeyboardOffset(y);
    });
  };

  return (
    <View ref={rootRef} style={styles.root} onLayout={handleRootLayout}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={keyboardOffset}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.listSection}>
            {showInitialSpinner ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" />
              </View>
            ) : errorMessage ? (
              <View style={styles.center}>
                <Text style={styles.errorText}>{errorMessage}</Text>
                <Pressable style={styles.retryButton} onPress={refetch}>
                  <Text style={styles.retryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : groups.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>No groups yet.</Text>
              </View>
            ) : (
              <View style={styles.list}>
                {groups.map((group) => (
                  <View key={group.id} style={styles.listItem}>
                    <Text style={styles.listItemText}>
                      {group.name}
                      {group.role === 'owner' ? ' (owner)' : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <CreateGroupForm
            onCreate={createGroup}
            creating={creating}
            createErrorMessage={createErrorMessage}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    gap: 16,
  },
  listSection: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: '#c0392b',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  list: {
    gap: 8,
  },
  listItem: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
  },
  listItemText: {
    fontSize: 16,
    color: '#222',
  },
});
