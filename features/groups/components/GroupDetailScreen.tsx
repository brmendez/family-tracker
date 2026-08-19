// features/groups/components/GroupDetailScreen.tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useGroups } from '../hooks/useGroups';
import { useLeaveGroup } from '../hooks/useLeaveGroup';
import { useSendInvite } from '../hooks/useSendInvite';
import { InviteForm } from './InviteForm';

/**
 * FT-9: a single group's detail screen — shows the group and lets a
 * member send an invite. Reuses useGroups() (FT-8) unchanged and finds
 * the matching group client-side rather than adding a near-duplicate
 * single-row fetch hook. "Group not found" covers the group having
 * auto-deleted mid-navigation (FT-7's last-member-leaves trigger).
 *
 * FT-11: adds a Leave group button with a destructive Alert.alert
 * confirmation, then navigates back to the groups list. GroupsScreen
 * refetches on focus (its own useGroups() instance, separate from this
 * screen's), so it picks up the departure without this screen needing
 * to coordinate the refetch itself.
 */
export const GroupDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groups, loading, errorMessage } = useGroups();
  const { sendInvite, sending, sendErrorMessage } = useSendInvite(id);
  const { leaveGroup, leaving, leaveErrorMessage } = useLeaveGroup();
  const router = useRouter();

  const group = groups.find((candidate) => candidate.id === id);
  const showInitialSpinner = loading && groups.length === 0 && !errorMessage;

  const handleLeave = async () => {
    if (!id) {
      return;
    }

    const { error } = await leaveGroup(id);

    if (!error) {
      router.back();
    }
  };

  const confirmLeave = () => {
    Alert.alert(
      'Leave group?',
      'You will lose access to this group and its members.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: handleLeave },
      ],
    );
  };

  if (showInitialSpinner) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (errorMessage && !group) {
    return (
      <View style={styles.center}>
        <Text style={styles.messageText}>{errorMessage}</Text>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.messageText}>This group no longer exists.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {group.name}
        {group.role === 'owner' ? ' (owner)' : ''}
      </Text>

      <InviteForm
        onInvite={sendInvite}
        sending={sending}
        sendErrorMessage={sendErrorMessage}
      />

      {leaveErrorMessage ? (
        <Text style={styles.errorText}>{leaveErrorMessage}</Text>
      ) : null}

      {leaving ? (
        <ActivityIndicator />
      ) : (
        <Pressable style={styles.leaveButton} onPress={confirmLeave}>
          <Text style={styles.leaveButtonText}>Leave group</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
  },
  messageText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  leaveButton: {
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#c0392b',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    color: '#c0392b',
  },
});
