// features/groups/components/GroupsScreen.tsx
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useGroupsContext } from '../../../context/groups.context';
import { VisibilityDurationSheet } from '../../visibility/components/VisibilityDurationSheet';
import { VisibilityToggleButton } from '../../visibility/components/VisibilityToggleButton';
import { useGlobalVisibility } from '../../visibility/hooks/useGlobalVisibility';
import { useSetGlobalVisibility } from '../../visibility/hooks/useSetGlobalVisibility';
import type { VisibilityDuration } from '../../visibility/types/visibility.types';
import { useGroups } from '../hooks/useGroups';
import { usePendingInvites } from '../hooks/usePendingInvites';
import { CreateGroupForm } from './CreateGroupForm';
import { PendingInvitesSection } from './PendingInvitesSection';

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
 *
 * FT-10: also calls usePendingInvites() and renders PendingInvitesSection
 * above the groups list. usePendingInvites and useGroups are independent
 * hook instances, so a successful accept won't make the new group appear
 * in useGroups' already-fetched list on its own — this is the one piece
 * of cross-hook coordination FT-10 adds, handled here since this is the
 * only place both hooks are in scope.
 *
 * FT-11: refetches on focus (not just mount) — GroupDetailScreen's Leave
 * flow navigates back here from a separate useGroups() instance, so this
 * screen's own list wouldn't otherwise learn about the departure.
 *
 * FT-12: a create or accept here also calls GroupsProvider's
 * refetchGroups() — a third independent hook instance (the map's
 * activeGroupId source) that would otherwise only learn about a new
 * group on the next full app launch.
 *
 * FT-21: hosts the global (not group-scoped) invisible toggle above the
 * groups list — same "catch-all surface for app-wide controls" precedent
 * as FT-15's NotificationPermissionBanner, reused rather than a dedicated
 * Settings screen. Reuses VisibilityToggleButton/VisibilityDurationSheet
 * unchanged, wired to the global (not per-group) hooks.
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

  const {
    invites,
    respond,
    respondingId,
    respondErrorMessage,
    respondErrorInviteId,
  } = usePendingInvites();

  const { refetchGroups } = useGroupsContext();

  const { state: globalVisibilityState, refetch: refetchGlobalVisibility } =
    useGlobalVisibility();
  const {
    setVisibility: setGlobalVisibility,
    setting: settingGlobalVisibility,
    setErrorMessage: globalVisibilityErrorMessage,
  } = useSetGlobalVisibility(refetchGlobalVisibility);
  const [visibilitySheetOpen, setVisibilitySheetOpen] = useState(false);

  const router = useRouter();
  const rootRef = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const showInitialSpinner = loading && groups.length === 0 && !errorMessage;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const handleRootLayout = () => {
    rootRef.current?.measureInWindow((_x, y) => {
      setKeyboardOffset(y);
    });
  };

  const handleRespond = async (inviteId: string, decision: 'accept' | 'decline') => {
    const { error } = await respond(inviteId, decision);

    if (!error && decision === 'accept') {
      await refetch();
      await refetchGroups();
    }

    return { error };
  };

  const handleCreateGroup = async (name: string) => {
    const { error } = await createGroup(name);

    if (!error) {
      await refetchGroups();
    }

    return { error };
  };

  const handleSelectGlobalVisibilityDuration = async (duration: VisibilityDuration) => {
    const { error } = await setGlobalVisibility(duration);

    if (!error) {
      setVisibilitySheetOpen(false);
    }
  };

  const handleGlobalUnhide = async () => {
    const { error } = await setGlobalVisibility('unhide');

    if (!error) {
      setVisibilitySheetOpen(false);
    }
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
          <PendingInvitesSection
            invites={invites}
            respond={handleRespond}
            respondingId={respondingId}
            respondErrorMessage={respondErrorMessage}
            respondErrorInviteId={respondErrorInviteId}
          />

          <VisibilityToggleButton
            isHidden={globalVisibilityState.isHidden}
            onPress={() => setVisibilitySheetOpen(true)}
            scope="global"
          />
          {visibilitySheetOpen ? (
            <VisibilityDurationSheet
              visible={visibilitySheetOpen}
              isHidden={globalVisibilityState.isHidden}
              setting={settingGlobalVisibility}
              errorMessage={globalVisibilityErrorMessage}
              onSelectDuration={handleSelectGlobalVisibilityDuration}
              onUnhide={handleGlobalUnhide}
              onClose={() => setVisibilitySheetOpen(false)}
            />
          ) : null}

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
                  <Pressable
                    key={group.id}
                    style={styles.listItem}
                    onPress={() => router.push(`/groups/${group.id}`)}
                  >
                    <Text style={styles.listItemText}>
                      {group.name}
                      {group.role === 'owner' ? ' (owner)' : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <CreateGroupForm
            onCreate={handleCreateGroup}
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
